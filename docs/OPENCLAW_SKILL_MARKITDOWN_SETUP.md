# OpenClaw skill setup: `markitdown`

## When to use it

- Convert PDF, Word, PPT, Excel, HTML, images (OCR/metadata), zipped bundles, etc. into **Markdown** for summarization, RAG, chat context, or batch ingestion.  
- Complements **docx / pptx / xlsx / pdf** skills: markitdown is **read/extract**; editing, formulas, PDF merges/forms still belong to the specialized skills.  
- Acts as the umbrella entrypoint; heavy batch jobs may route to `markitdown-ingest`, multimodal plugins to `markitdown-multimodal` (see `skills/markitdown/SKILL.md`).

## Prerequisites

- Python 3.10+  
- Shared venv: `${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}`  
- Packages:

```text
markitdown[all]
pypdf pdfplumber reportlab pdf2image pytesseract pillow pandas openpyxl defusedxml
```

## Install

```bash
export PYTHON_SKILLS_VENV="${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}"
python3 -m venv "$PYTHON_SKILLS_VENV"
"$PYTHON_SKILLS_VENV/bin/python" -m pip install -U pip setuptools wheel
"$PYTHON_SKILLS_VENV/bin/python" -m pip install "markitdown[all]"
"$PYTHON_SKILLS_VENV/bin/python" -m pip install pypdf pdfplumber reportlab pdf2image pytesseract pillow pandas openpyxl defusedxml
cd ~/projects/yours && ./scripts/wsl-migrate.sh
```

Ensure `"$PYTHON_SKILLS_VENV/bin/markitdown"` is on the PATH OpenClaw uses.

## `openclaw.json`

```json
"skills": {
  "entries": {
    "markitdown": {
      "enabled": true,
      "env": {
        "SKILLS_ROOT": "~/.openclaw/skills",
        "PYTHON_SKILLS_VENV": "$HOME/.openclaw/venvs/python-skills"
      }
    }
  }
}
```

For the full trio, enable `markitdown`, `markitdown-ingest`, and `markitdown-multimodal` together.

## Verify

Ask to convert a sample PDF/Office file in the workspace to Markdown.

## Reference

- [microsoft/markitdown](https://github.com/microsoft/markitdown)
