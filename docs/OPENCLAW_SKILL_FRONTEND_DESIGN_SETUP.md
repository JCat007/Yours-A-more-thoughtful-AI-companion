# OpenClaw skill setup: `frontend-design`

## When to use it

- Landing pages, component styling, UI scaffolding, React/HTML drafts.

## Prerequisites

- Usually none beyond Node tooling already required by OpenClaw (confirm in `skills/frontend-design/SKILL.md`).

## Install

```bash
cd ~/.openclaw/skills
# Sync from this repo, e.g.:
# ./scripts/wsl-migrate.sh
```

## `openclaw.json`

```json
"skills": {
  "entries": {
    "frontend-design": {
      "enabled": true,
      "env": { "SKILLS_ROOT": "~/.openclaw/skills" }
    }
  }
}
```

## Verify

Ask for a minimal marketing landing page and confirm code artifacts land in the workspace.
