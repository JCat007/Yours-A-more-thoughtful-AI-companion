#!/usr/bin/env bash
set -euo pipefail

echo "[1/4] Updating apt index"
sudo apt-get update

echo "[2/4] Installing core system dependencies"
sudo apt-get install -y --no-install-recommends \
  ca-certificates curl git jq \
  ffmpeg pandoc poppler-utils tesseract-ocr qpdf \
  libreoffice

echo "[3/4] Installing Chromium (for browser automation where needed)"
if apt-cache show chromium-browser >/dev/null 2>&1; then
  sudo apt-get install -y --no-install-recommends chromium-browser
elif apt-cache show chromium >/dev/null 2>&1; then
  sudo apt-get install -y --no-install-recommends chromium
else
  echo "WARN: chromium package not found in current apt sources. Skipping."
fi

echo "[4/4] Verifying required binaries"
for cmd in ffmpeg pandoc pdftoppm tesseract qpdf soffice; do
  if command -v "$cmd" >/dev/null 2>&1; then
    echo "OK: $cmd -> $(command -v "$cmd")"
  else
    echo "ERROR: missing binary '$cmd'" >&2
    exit 1
  fi
done

if command -v chromium-browser >/dev/null 2>&1; then
  echo "OK: chromium-browser -> $(command -v chromium-browser)"
elif command -v chromium >/dev/null 2>&1; then
  echo "OK: chromium -> $(command -v chromium)"
else
  echo "WARN: chromium not found; Playwright browser tests may fail"
fi

echo "System dependency setup completed."
