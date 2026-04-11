#!/usr/bin/env bash
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/star-office-ui/backend"
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
if [ -x ../.venv/bin/python ]; then
  exec ../.venv/bin/python app.py
fi
exec python3 app.py
