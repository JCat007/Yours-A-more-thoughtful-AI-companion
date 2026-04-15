# OpenClaw skill setup: `pptx`

## When to use it

- Author or edit slide decks, multi-page PPT automation.

For **Markdown-only** extraction from `.pptx`, prefer **markitdown** (same CLI as `python -m markitdown`) — see [OPENCLAW_SKILL_MARKITDOWN_SETUP.md](OPENCLAW_SKILL_MARKITDOWN_SETUP.md).

## Prerequisites

- Python venv: `${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}`  
- Python: `markitdown[pptx]`, `defusedxml`  
- Global npm: `pptxgenjs`, `playwright`, `sharp`  
- `npx playwright install chromium`  
- LibreOffice (often needed for compatibility conversions)

## Install

```bash
export PYTHON_SKILLS_VENV="${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}"
"$PYTHON_SKILLS_VENV/bin/python" -m pip install "markitdown[pptx]" defusedxml
npm install -g pptxgenjs playwright sharp
npx playwright install chromium
```

## `openclaw.json`

```json
"skills": {
  "entries": {
    "pptx": {
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

Ask for a short multi-slide deck (e.g. “5-slide outline about …”) and confirm artifacts appear in the workspace.
