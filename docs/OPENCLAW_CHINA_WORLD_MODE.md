# OpenClaw China / World mode

## Overview

| Mode | Primary model | API | Fallback | Proxy |
|------|----------------|-----|----------|--------|
| **China** | MiniMax M2.7 | api.minimax.com (region-appropriate host) | — | **No proxy** (by default) |
| **World** | Gemini 1.5 Pro | Google Generative Language API | MiniMax global | As needed |

The UI toggle sends `mode` to the backend so the correct stack is used.

---

## 1) China mode (required hygiene)

**China mode should not force HTTP(S)_PROXY** for MiniMax—proxies often break connectivity.

Edit `~/.openclaw/openclaw.json` and **remove** global proxy entries if they interfere:

```json
"HTTP_PROXY": "http://127.0.0.1:7890",
"HTTPS_PROXY": "http://127.0.0.1:7890"
```

Optionally remove `WEATHER_PROXY` from `skills.entries.weather.env` if you rely on direct Open-Meteo.

Restart the gateway after edits:

```bash
openclaw gateway stop
openclaw gateway --port 18789
```

### Optional helper script

```bash
cd ~/projects/yours
node scripts/openclaw-apply-china-world.js
```

(Adjust the path to match your clone.)

---

## 2) China mode (reference defaults)

- Agent: `main` (or your configured agent)  
- Model: `minimax/MiniMax-M2.7` (example)  
- API: vendor-specific China endpoint  
- Proxy: none for MiniMax traffic  
- Skills: weather, pdf, seedream, seedance, etc.

---

## 3) World mode (suggested layout)

### Primary + fallback

- Primary: `gemini/gemini-1.5-pro` (example)  
- Fallback: `minimax-global/MiniMax-M2.7` via `api.minimax.io` (example)

### Prerequisites

1. **Gemini** — set keys in your local environment (never commit):  
   `GEMINI_API_KEY`, optional `GEMINI_BASE_URL`.  
2. **Proxy (optional)** — some regions need HTTP(S) proxy for Google APIs:  
   - Edit `openclaw.json` `env`, **or**  
   - Export proxy vars in the shell before launching the gateway, **or**  
   - Automate with a future `switch-bella-mode` script.

### Example `env` block (World only)

```json
{
  "env": {
    "HTTP_PROXY": "http://127.0.0.1:7890",
    "HTTPS_PROXY": "http://127.0.0.1:7890"
  }
}
```

### Future automation

A small script (`switch-bella-mode.sh china|world`) could rewrite proxy blocks and restart the gateway.

---

## 4) Backend overrides (`backend/.env`)

```env
OPENCLAW_MODEL_CHINA=minimax/MiniMax-M2.7
OPENCLAW_MODEL_WORLD=gemini/gemini-1.5-pro
OPENCLAW_MODEL_FALLBACKS=minimax-global/MiniMax-M2.7
```

---

## 5) Outer persona + memory (optional)

```env
BELLA_OUTER_PROVIDER_CHINA=doubao
BELLA_OUTER_PROVIDER_WORLD=gemini
BELLA_OUTER_FALLBACK_PROVIDER_CHINA=doubao
BELLA_OUTER_FALLBACK_PROVIDER_WORLD=doubao

BELLA_DOUBAO_API_KEY=__SET_LOCALLY__
BELLA_GEMINI_API_KEY=__SET_LOCALLY__

BELLA_MEMORY_TURNS=12
BELLA_MEMORY_MAX_SESSIONS=300
BELLA_MEMORY_FILE=/home/<you>/projects/yours/backend/data/bella-state.json

BELLA_ROUTER_MODE=hybrid
BELLA_INTENT_PROVIDER_CHINA=doubao
BELLA_INTENT_PROVIDER_WORLD=gemini
BELLA_INTENT_MODEL_CHINA=doubao-seed-1-6-251015
BELLA_INTENT_MODEL_WORLD=gemini-1.5-flash
BELLA_INTENT_CONF_THRESHOLD=0.65
```

Notes:

- `BELLA_OUTER_PROVIDER_*` selects the persona LLM family per region.  
- `BELLA_OUTER_FALLBACK_PROVIDER_*` covers outages.  
- `BELLA_MEMORY_FILE` persists short session context across restarts.  
- `BELLA_ROUTER_MODE=hybrid` uses the router LLM first, then heuristics on low confidence.
