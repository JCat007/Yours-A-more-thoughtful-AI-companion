# OpenClaw skill setup: `docx`

## When to use it

- Create or edit `.docx`, revisions, comments, structured writing.

If you only need **Markdown** from `.docx` for the model to read, prefer **markitdown** ([OPENCLAW_SKILL_MARKITDOWN_SETUP.md](OPENCLAW_SKILL_MARKITDOWN_SETUP.md)).

## Prerequisites

- `pandoc`  
- Python in `${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}`  
- Python packages: `defusedxml`, `markitdown[docx]` (read paths)  
- `docx` npm CLI (per skill instructions)  
- LibreOffice (optional but common for conversions)

## Install

```bash
export PYTHON_SKILLS_VENV="${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}"
"$PYTHON_SKILLS_VENV/bin/python" -m pip install defusedxml "markitdown[docx]"
cd ~/projects/yours && ./scripts/wsl-migrate.sh
```

## `openclaw.json`

```json
"skills": {
  "entries": {
    "docx": {
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

Prompt for a Word outline or a simple `.docx` generation task and confirm the skill runs.
