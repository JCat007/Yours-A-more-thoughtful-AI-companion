#!/usr/bin/env bash
# Launched from dev-start.bat via: wsl ... bash REPO/scripts/wsl-openclaw-gateway.sh
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
if [ -f "$ROOT/backend/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT/backend/.env"
  set +a
fi
if [ -f "${HOME}/.openclaw/.secrets.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "${HOME}/.openclaw/.secrets.env"
  set +a
fi
if [ -x "${HOME}/.npm-global/bin/openclaw" ]; then
  exec "${HOME}/.npm-global/bin/openclaw" gateway --port 18789 --auth token
fi
exec openclaw gateway --port 18789 --auth token
