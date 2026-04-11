#!/usr/bin/env bash
# Remove orphaned Prisma migration dirs left after SQLite -> PostgreSQL switch.
# Fixes: Error P3015 — Could not find migration file .../20260210040508_init/migration.sql
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
M="$ROOT/backend/prisma/migrations"
for d in "$M/20260210040508_init" "$M/20260211061854_add_fetched_day"; do
  if [[ -d "$d" ]]; then
    echo "Removing legacy dir: $d"
    rm -rf "$d"
  fi
done
echo "Current migrations:"
ls -la "$M"
