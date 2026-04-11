# OpenClaw skill setup: `markitdown-ingest`

## When to use it

- Folder-scale conversion pipelines (many files → Markdown).  
- Needs cleaning, chunking, manifests, indexes, error ledgers.  
- RAG ingestion / archival automation.

## Prerequisites

- Python 3.10+  
- Shared venv `${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}`  
- Same Python stack as base markitdown (`markitdown[all]` + PDF/table/OCR helpers)

## Install

```bash
export PYTHON_SKILLS_VENV="${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}"
python3 -m venv "$PYTHON_SKILLS_VENV"
"$PYTHON_SKILLS_VENV/bin/python" -m pip install -U pip setuptools wheel
"$PYTHON_SKILLS_VENV/bin/python" -m pip install "markitdown[all]"
"$PYTHON_SKILLS_VENV/bin/python" -m pip install pypdf pdfplumber reportlab pdf2image pytesseract pillow pandas openpyxl defusedxml
cd ~/projects/yours
./scripts/wsl-migrate.sh
node ./scripts/openclaw-apply-china-world.js
```

## `openclaw.json`

```json
"skills": {
  "entries": {
    "markitdown-ingest": {
      "enabled": true,
      "env": {
        "SKILLS_ROOT": "~/.openclaw/skills",
        "PYTHON_SKILLS_VENV": "$HOME/.openclaw/venvs/python-skills"
      }
    }
  }
}
```

## Verify

Ask to convert an entire directory to Markdown with a manifest file listing successes/failures.
