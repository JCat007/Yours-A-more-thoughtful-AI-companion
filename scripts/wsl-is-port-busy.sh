#!/usr/bin/env bash
# Used by dev-start.bat / dev-down.bat - keep ASCII only; no single quotes (CMD for /f parses '...').
set -eu
port="${1:-}"
if [[ -z "$port" ]] || ! [[ "$port" =~ ^[0-9]+$ ]]; then
  echo 0
  exit 0
fi
if command -v lsof >/dev/null 2>&1; then
  if lsof -ti:"$port" -sTCP:LISTEN >/dev/null 2>&1; then echo 1; else echo 0; fi
elif command -v ss >/dev/null 2>&1; then
  if ss -ltn 2>/dev/null | grep -qE ":${port}([^0-9]|$)"; then echo 1; else echo 0; fi
else
  echo 0
fi
