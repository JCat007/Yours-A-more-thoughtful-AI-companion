#!/usr/bin/env bash
set -euo pipefail

VENV_PATH="${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}"

echo "[1/4] Creating/updating Python venv: $VENV_PATH"
python3 -m venv "$VENV_PATH"
"$VENV_PATH/bin/python" -m pip install -U pip setuptools wheel

echo "[2/4] Installing shared Python dependencies for OpenClaw skills"
"$VENV_PATH/bin/python" -m pip install \
  "markitdown[all]" \
  pypdf pdfplumber reportlab pdf2image pytesseract pillow \
  pandas openpyxl defusedxml python-docx

echo "[3/4] Verifying imports and binaries"
"$VENV_PATH/bin/python" -c "import markitdown,pypdf,pdfplumber,pandas,openpyxl,defusedxml; print('python skills venv ok')"
"$VENV_PATH/bin/markitdown" --help >/dev/null

echo "[4/4] Done"
echo "Use these commands in skills/scripts:"
echo "  \$PYTHON_SKILLS_VENV/bin/python"
echo "  \$PYTHON_SKILLS_VENV/bin/markitdown"
echo ""
echo "Tip: add this to your shell profile:"
echo "  export PYTHON_SKILLS_VENV=\"$VENV_PATH\""
