#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_FILE="${DEPLOY_CONFIG:-$ROOT_DIR/.deploy.env}"

usage() {
  cat <<'EOF'
Usage: scripts/update-env.sh [--restart] [--no-check] [user@host]

Copies the local .env file to the configured server over SSH/SCP, installs it as
/opt/ai-infra/.env with mode 600, and runs `docker compose config --quiet`.

Configuration is read from .deploy.env by default:
  DEPLOY_REMOTE=ubuntu@your-server-ip
  DEPLOY_SSH_KEY=~/.ssh/your-server-key
  DEPLOY_REMOTE_DIR=/opt/ai-infra
  DEPLOY_LOCAL_ENV=.env
  DEPLOY_RESTART=false

Options:
  --restart   Recreate carshare and agent-runtime after updating .env.
  --no-check  Skip remote `docker compose config --quiet`.
  user@host   Override DEPLOY_REMOTE for this run.
EOF
}

if [[ -f "$CONFIG_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  source "$CONFIG_FILE"
  set +a
fi

REMOTE="${DEPLOY_REMOTE:-}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/opt/ai-infra}"
LOCAL_ENV="${DEPLOY_LOCAL_ENV:-.env}"
SSH_KEY="${DEPLOY_SSH_KEY:-}"
RESTART="${DEPLOY_RESTART:-false}"
CHECK="true"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --restart)
      RESTART="true"
      shift
      ;;
    --no-check)
      CHECK="false"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *@*)
      REMOTE="$1"
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ -z "$REMOTE" ]]; then
  echo "Missing DEPLOY_REMOTE. Set it in $CONFIG_FILE or pass user@host." >&2
  exit 2
fi

if [[ "$LOCAL_ENV" != /* ]]; then
  LOCAL_ENV="$ROOT_DIR/$LOCAL_ENV"
fi

if [[ ! -f "$LOCAL_ENV" ]]; then
  echo "Missing local env file: $LOCAL_ENV" >&2
  exit 1
fi

if [[ -n "$SSH_KEY" ]]; then
  SSH_KEY="${SSH_KEY/#\~/$HOME}"
  if [[ ! -f "$SSH_KEY" ]]; then
    echo "Missing SSH key: $SSH_KEY" >&2
    exit 1
  fi
fi

ssh_args=()
scp_args=()
if [[ -n "$SSH_KEY" ]]; then
  ssh_args+=("-i" "$SSH_KEY")
  scp_args+=("-i" "$SSH_KEY")
fi

remote_tmp="/tmp/ai-infra.env.$(date -u +%Y%m%dT%H%M%SZ).$$"

scp "${scp_args[@]}" "$LOCAL_ENV" "$REMOTE:$remote_tmp"

ssh "${ssh_args[@]}" "$REMOTE" \
  "REMOTE_DIR='$REMOTE_DIR' REMOTE_TMP='$remote_tmp' CHECK='$CHECK' RESTART='$RESTART' bash -s" <<'REMOTE_SCRIPT'
set -euo pipefail

if [[ ! -d "$REMOTE_DIR" ]]; then
  echo "Remote directory does not exist: $REMOTE_DIR" >&2
  rm -f "$REMOTE_TMP"
  exit 1
fi

install -m 600 "$REMOTE_TMP" "$REMOTE_DIR/.env"
rm -f "$REMOTE_TMP"

cd "$REMOTE_DIR"

if [[ "$CHECK" == "true" ]]; then
  docker compose config --quiet
fi

if [[ "$RESTART" == "true" ]]; then
  docker compose up -d --force-recreate carshare agent-runtime
fi
REMOTE_SCRIPT

echo "Updated $REMOTE:$REMOTE_DIR/.env"
if [[ "$RESTART" == "true" ]]; then
  echo "Recreated carshare and agent-runtime."
fi
