#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
INFRA_DIR="$ROOT_DIR/infra"

MAX_HOURS="${RETRY_MAX_HOURS:-10}"
ROUND_SLEEP_MIN_SECONDS="${RETRY_SLEEP_MIN_SECONDS:-120}"
ROUND_SLEEP_MAX_SECONDS="${RETRY_SLEEP_MAX_SECONDS:-300}"
AD_SLEEP_SECONDS="${RETRY_AD_SLEEP_SECONDS:-10}"
RATE_LIMIT_SLEEP_SECONDS="${RETRY_429_SLEEP_SECONDS:-3600}"
LOG_FILE="${RETRY_LOG_FILE:-$ROOT_DIR/backup/oci-a1-retry.log}"

if [[ ! -f "$INFRA_DIR/terraform.tfvars" ]]; then
  echo "Missing $INFRA_DIR/terraform.tfvars" >&2
  exit 1
fi

if ! command -v terraform >/dev/null 2>&1; then
  echo "terraform is not installed or not on PATH" >&2
  exit 1
fi

mkdir -p "$(dirname "$LOG_FILE")"

log() {
  local message="$1"
  printf '[%s] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$message" | tee -a "$LOG_FILE"
}

random_sleep_seconds() {
  local min="$1"
  local max="$2"

  if (( max <= min )); then
    printf '%s\n' "$min"
    return
  fi

  printf '%s\n' $((min + RANDOM % (max - min + 1)))
}

discover_ads() {
  if [[ -n "${OCI_ADS:-}" ]]; then
    printf '%s\n' "$OCI_ADS" | tr ',' '\n' | sed 's/^ *//; s/ *$//' | grep -v '^$'
    return
  fi

  local raw
  raw="$(terraform -chdir="$INFRA_DIR" console <<'EOF' 2>/dev/null
data.oci_identity_availability_domains.ads.availability_domains[*].name
EOF
)"

  printf '%s\n' "$raw" | sed -n 's/.*"\([^"]*:.*AD-[0-9][^"]*\)".*/\1/p'
}

mapfile -t ADS < <(discover_ads)

if (( ${#ADS[@]} == 0 )); then
  cat >&2 <<EOF
Could not auto-discover OCI availability domains.

Run with explicit AD names, for example:

OCI_ADS="xxxx:EU-FRANKFURT-1-AD-1,xxxx:EU-FRANKFURT-1-AD-2,xxxx:EU-FRANKFURT-1-AD-3" \
  scripts/retry-oci-a1.sh
EOF
  exit 1
fi

start_epoch="$(date +%s)"
deadline_epoch="$((start_epoch + MAX_HOURS * 3600))"
attempt=0
round=0

log "Starting OCI A1 retry loop"
log "AD rotation: ${ADS[*]}"
log "Max runtime: ${MAX_HOURS}h; AD sleep: ${AD_SLEEP_SECONDS}s; round sleep: ${ROUND_SLEEP_MIN_SECONDS}-${ROUND_SLEEP_MAX_SECONDS}s; 429 sleep: ${RATE_LIMIT_SLEEP_SECONDS}s"
log "Log file: $LOG_FILE"

while true; do
  now_epoch="$(date +%s)"
  if (( now_epoch >= deadline_epoch )); then
    log "Reached max runtime without creating the instance"
    exit 2
  fi

  round="$((round + 1))"
  log "Starting round ${round} across ${#ADS[@]} availability domain(s)"

  for ad_index in "${!ADS[@]}"; do
    now_epoch="$(date +%s)"
    if (( now_epoch >= deadline_epoch )); then
      log "Reached max runtime without creating the instance"
      exit 2
    fi

    ad="${ADS[$ad_index]}"
    attempt="$((attempt + 1))"

    log "Attempt ${attempt}: terraform apply in $ad"

    set +e
    output="$(terraform -chdir="$INFRA_DIR" apply -auto-approve -input=false -var="availability_domain=$ad" 2>&1)"
    status="$?"
    set -e

    {
      printf '\n===== attempt %s / round %s / %s / exit %s =====\n' "$attempt" "$round" "$ad" "$status"
      printf '%s\n' "$output"
    } >> "$LOG_FILE"

    if (( status == 0 )); then
      log "Success: Terraform created or converged the infrastructure"
      terraform -chdir="$INFRA_DIR" output || true
      exit 0
    fi

    if grep -qi 'Out of host capacity' <<<"$output"; then
      log "Out of host capacity in $ad"
      if (( ad_index < ${#ADS[@]} - 1 )); then
        log "Sleeping ${AD_SLEEP_SECONDS}s before next AD"
        sleep "$AD_SLEEP_SECONDS"
      fi
      continue
    fi

    if grep -Eqi 'Too many requests|(^|[^0-9])429([^0-9]|$)' <<<"$output"; then
      log "Rate limited by OCI; sleeping ${RATE_LIMIT_SLEEP_SECONDS}s"
      sleep "$RATE_LIMIT_SLEEP_SECONDS"
      continue 2
    fi

    if grep -qi 'LimitExceeded' <<<"$output"; then
      log "Stopping on LimitExceeded. Check A1 limits, existing instances, and leftover boot volumes."
      exit 3
    fi

    log "Stopping on non-capacity Terraform error. See $LOG_FILE"
    exit "$status"
  done

  sleep_seconds="$(random_sleep_seconds "$ROUND_SLEEP_MIN_SECONDS" "$ROUND_SLEEP_MAX_SECONDS")"
  log "Completed round ${round}; sleeping ${sleep_seconds}s before the next round"
  sleep "$sleep_seconds"
done
