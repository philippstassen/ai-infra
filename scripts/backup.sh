#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="$ROOT_DIR/backup"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

if [[ ! -f "$ROOT_DIR/.env" ]]; then
  echo ".env not found in $ROOT_DIR" >&2
  exit 1
fi

set -a
source "$ROOT_DIR/.env"
set +a

mkdir -p "$BACKUP_DIR"

docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
  pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" \
  | gzip > "$BACKUP_DIR/postgres-${STAMP}.sql.gz"

docker compose -f "$ROOT_DIR/docker-compose.yml" exec -T postgres \
  pg_dumpall -U "$POSTGRES_USER" --globals-only \
  | gzip > "$BACKUP_DIR/postgres-globals-${STAMP}.sql.gz"

find "$BACKUP_DIR" -type f -name '*.sql.gz' -mtime "+${BACKUP_KEEP_DAYS:-7}" -delete

echo "Backups written to $BACKUP_DIR"
