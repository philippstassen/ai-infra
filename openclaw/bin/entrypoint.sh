#!/usr/bin/env sh
set -eu

SOURCE_DIR="/etc/openclaw-src"
STATE_DIR="${OPENCLAW_STATE_DIR:-/var/lib/openclaw}"

mkdir -p \
  "$STATE_DIR/config" \
  "$STATE_DIR/agents/scratch/workspace" \
  "$STATE_DIR/agents/carshare/workspace"

cp "$SOURCE_DIR/openclaw.json5" "$STATE_DIR/config/openclaw.json5"

if [ -d "$SOURCE_DIR/agents/scratch/workspace" ]; then
  cp -R "$SOURCE_DIR/agents/scratch/workspace/." "$STATE_DIR/agents/scratch/workspace/"
fi

if [ -d "$SOURCE_DIR/agents/carshare/workspace" ]; then
  cp -R "$SOURCE_DIR/agents/carshare/workspace/." "$STATE_DIR/agents/carshare/workspace/"
fi

exec "$@"
