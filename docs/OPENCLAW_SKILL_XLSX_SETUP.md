# OpenClaw skill setup: `xlsx`

## When to use it

- Build spreadsheets, formulas, structured exports.

For **Markdown-only** reads of `.xlsx` (no formula fidelity), **markitdown** may suffice ([OPENCLAW_SKILL_MARKITDOWN_SETUP.md](OPENCLAW_SKILL_MARKITDOWN_SETUP.md)). Use **`xlsx`** when you need real edits/recalc.

## Prerequisites

- Python venv: `${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}`  
- Python: `pandas`, `openpyxl`, `markitdown[xlsx]` (read paths)  
- LibreOffice (optional)

## Install

```bash
export PYTHON_SKILLS_VENV="${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}"
"$PYTHON_SKILLS_VENV/bin/python" -m pip install pandas openpyxl "markitdown[xlsx]"
```

## `openclaw.json`

```json
"skills": {
  "entries": {
    "xlsx": {
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

Prompt for a simple sales table or formula example and inspect the generated workbook.
