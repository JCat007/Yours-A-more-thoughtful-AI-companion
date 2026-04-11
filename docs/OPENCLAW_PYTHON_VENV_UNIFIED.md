# Unified Python venv for OpenClaw skills

Use one interpreter tree for Python-heavy skills:

- `${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}`

Typical skills: `pdf`, `docx`, `pptx`, `xlsx`, `markitdown`, `markitdown-ingest`, `markitdown-multimodal`.

## One-shot bootstrap (WSL)

```bash
set -e

export PYTHON_SKILLS_VENV="${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}"
python3 -m venv "$PYTHON_SKILLS_VENV"
"$PYTHON_SKILLS_VENV/bin/python" -m pip install -U pip setuptools wheel

# Document extraction + PDF + spreadsheets + XML hardening
"$PYTHON_SKILLS_VENV/bin/python" -m pip install \
  "markitdown[all]" \
  pypdf pdfplumber reportlab pdf2image pytesseract pillow \
  pandas openpyxl defusedxml

# Optional: direct python-docx scripts
"$PYTHON_SKILLS_VENV/bin/python" -m pip install python-docx

# Smoke test
"$PYTHON_SKILLS_VENV/bin/python" -c "import markitdown,pypdf,pdfplumber,pandas,openpyxl,defusedxml; print('python skills venv ok')"
"$PYTHON_SKILLS_VENV/bin/markitdown" --help
```

## `openclaw.json`

Add to global `env` (or per-skill `env`):

```json
"PYTHON_SKILLS_VENV": "$HOME/.openclaw/venvs/python-skills"
```

Ensure each skill has `skills.entries.<skill>.enabled = true`.

## Operations

- Prefer `"$PYTHON_SKILLS_VENV/bin/python"` and `"$PYTHON_SKILLS_VENV/bin/markitdown"` for skill subprocesses.  
- Avoid `sudo pip install` on the system interpreter (PEP 668 / drift).
