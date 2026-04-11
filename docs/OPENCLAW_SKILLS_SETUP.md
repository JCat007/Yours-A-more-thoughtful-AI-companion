# OpenClaw skills — index

Navigation page for skill installation docs (keeps setup content in one place per skill).

## Scope

- This page is an **index** only.  
- Gateway wiring: `OPENCLAW_SETUP.md`  
- Shared Python venv layout: `OPENCLAW_PYTHON_VENV_UNIFIED.md`  
- Legacy `LOBSTERAI_SKILLS_SETUP.md` content has been folded into this structure.

## Documented skills

- `canvas-design` → `OPENCLAW_SKILL_CANVAS_DESIGN_SETUP.md`  
- `docx` → `OPENCLAW_SKILL_DOCX_SETUP.md`  
- `markitdown` → `OPENCLAW_SKILL_MARKITDOWN_SETUP.md`  
- `markitdown-ingest` → `OPENCLAW_SKILL_MARKITDOWN_INGEST_SETUP.md`  
- `markitdown-multimodal` → `OPENCLAW_SKILL_MARKITDOWN_MULTIMODAL_SETUP.md`  
- `frontend-design` → `OPENCLAW_SKILL_FRONTEND_DESIGN_SETUP.md`  
- `pptx` → `OPENCLAW_SKILL_PPTX_SETUP.md`  
- `xlsx` → `OPENCLAW_SKILL_XLSX_SETUP.md`  

## Other skills

- `pdf` → `OPENCLAW_SKILL_PDF_SETUP.md`  
- `web-to-markdown` → `OPENCLAW_SKILL_WEB_TO_MARKDOWN_SETUP.md`  
- `media-image` (default `seedream`) → `OPENCLAW_SKILL_MEDIA_IMAGE_SETUP.md`  
- `media-video` (default `seedance`) → `OPENCLAW_SKILL_MEDIA_VIDEO_SETUP.md`  

## External / marketplace skills

- `taobao-shop-price` (recommended default) → `OPENCLAW_SKILL_TAOBAO_SHOP_PRICE_SETUP.md`  
- Legacy bundle “China e-commerce price comparison” → `OPENCLAW_SKILL_CHINA_E_COMMERCE_PRICE_COMPARISON_SKILLS_SETUP.md`  
- **gbrain** (Garry Tan) — companion long-term memory / hybrid search: install from [garrytan/gbrain](https://github.com/garrytan/gbrain); align write paths with Bella slug prefix `companion/<bella_users.id>/` (see `docs/COMPANION_AUTH_GBRAIN.md`).  

## Quick install snippets

```bash
# Sync bundled skills into ~/.openclaw/skills (project script)
./scripts/wsl-migrate.sh

# Or apply China/World-oriented OpenClaw tweaks
node scripts/openclaw-apply-china-world.js
```

## Verification checklist

- `~/.openclaw/openclaw.json` → `skills.entries.<skill>.enabled = true` where needed.  
- Python skills share `${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}` when documented.  
- Native dependencies installed (apt/brew packages, pip, npm).  
- Restart the OpenClaw gateway and trigger each skill once.

## Provider naming (forward-looking)

```env
MEDIA_IMAGE_PROVIDER=seedream
MEDIA_VIDEO_PROVIDER=seedance
MEDIA_IMAGE_FALLBACKS=gemini-image,openai-image
MEDIA_VIDEO_FALLBACKS=gemini-video
```

Runtime code still accepts legacy seedream/seedance wiring; these vars standardize future multi-provider docs.
