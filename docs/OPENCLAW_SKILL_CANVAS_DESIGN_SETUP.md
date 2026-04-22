# OpenClaw skill setup: `canvas-design`

## When to use it

- Posters, visual comps, layout-heavy design briefs, design PDFs/PNGs.

## Prerequisites

- Python environment reachable from OpenClaw  
- `reportlab` (typical dependency for PDF output—confirm against `skills/canvas-design/SKILL.md`)

## Install

```bash
cd ~/.openclaw/skills
# Prefer syncing from this repo:
# ./scripts/wsl-migrate.sh
```

## `openclaw.json`

```json
"skills": {
  "entries": {
    "canvas-design": {
      "enabled": true,
      "env": { "SKILLS_ROOT": "~/.openclaw/skills" }
    }
  }
}
```

## Verify

Ask for an event poster or branded layout and confirm the skill path produces downloadable assets.
