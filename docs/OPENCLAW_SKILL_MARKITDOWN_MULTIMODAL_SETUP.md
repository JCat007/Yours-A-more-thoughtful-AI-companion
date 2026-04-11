# OpenClaw skill setup: `markitdown-multimodal`

## When to use it

- Image OCR, audio transcription, YouTube → text.  
- Plugin-enhanced flows (`--use-plugins`).  
- Azure Document Intelligence integrations (when configured upstream).

## Prerequisites

- Python 3.10+  
- Shared venv `${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}`  
- Same base stack as other markitdown docs (`markitdown[all]` + PDF/table/OCR helpers)

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
    "markitdown-multimodal": {
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

- “OCR this image to Markdown.”  
- “Turn this YouTube URL into Markdown text.”
