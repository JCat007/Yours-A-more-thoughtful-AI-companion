# OpenClaw skill setup: `web-to-markdown`

## Scope

- Covers installing/enabling **`web-to-markdown`** in OpenClaw.  
- Gateway basics: `OPENCLAW_SETUP.md`.  
- Other skills: `OPENCLAW_SKILLS_SETUP.md`.

## When to use it

- User supplies a URL; you need article body as Markdown.  
- Downstream summarization, translation, or RAG ingestion.  
- Different from **`markitdown`** (file conversion) — this skill targets **URL fetch** pipelines.

## Prerequisites

- Node.js 18+ (global `fetch`).  
- Reachable public internet (defaults try `r.jina.ai` first).

## Install

```bash
./scripts/wsl-migrate.sh
chmod +x ~/.openclaw/skills/web-to-markdown/scripts/url_to_markdown.mjs   # optional
```

## `openclaw.json`

```json
"web-to-markdown": {
  "enabled": true,
  "env": {
    "SKILLS_ROOT": "$HOME/.openclaw/skills"
  }
}
```

## Smoke test

```bash
node "$HOME/.openclaw/skills/web-to-markdown/scripts/url_to_markdown.mjs" "https://example.com"
node "$HOME/.openclaw/skills/web-to-markdown/scripts/url_to_markdown.mjs" "https://example.com" --json
```

Expect Markdown on stdout; `--json` adds metadata (strategy, normalized URL, etc.).

## Troubleshooting

- **Auth-only pages** — use browser extraction or supply cookies/session another way.  
- **Empty body** — heavy client-side rendering; add browser tooling.  
- **Timeouts** — check proxy/VPN and gateway timeouts.

## Reference

- [rookie-ricardo/erduo-skills](https://github.com/rookie-ricardo/erduo-skills)
