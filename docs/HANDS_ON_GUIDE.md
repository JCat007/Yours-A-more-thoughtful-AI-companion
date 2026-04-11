# Bella + MiniMax — hands-on checklist

Work top to bottom. Check each box when done.

---

## 1) Get a MiniMax API key (~5 min)

1. Open `https://platform.minimaxi.com` (China) or `https://platform.minimax.io` (global).  
2. Sign in → API keys → create key.  
3. Copy the `sk-...` secret (shown once).

✅ Key saved offline.

---

## 2) Open a Linux shell in your project

```bash
cd ~/projects/yours    # or /mnt/c/Users/<you>/path/to/yours on WSL
ls                     # expect backend/, frontend/, docs/
```

✅ In repo root.

---

## 3) Install Bella SOUL

```bash
mkdir -p ~/.openclaw/workspace
cp docs/templates/Bella-SOUL.md ~/.openclaw/workspace/SOUL.md
head -5 ~/.openclaw/workspace/SOUL.md
```

✅ SOUL file present.

---

## 4) Configure OpenClaw (`~/.openclaw/openclaw.json`)

Use `nano ~/.openclaw/openclaw.json` (or your editor). Merge a minimax provider block; replace placeholders:

```json
{
  "gateway": {
    "mode": "local",
    "http": { "endpoints": { "chatCompletions": { "enabled": true } } }
  },
  "env": { "MINIMAX_API_KEY": "<YOUR_MINIMAX_KEY>" },
  "agents": {
    "defaults": {
      "model": {
        "primary": "minimax/MiniMax-M2.5",
        "fallbacks": ["openai-codex/gpt-5.3-codex"]
      }
    }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "minimax": {
        "baseUrl": "https://api.minimaxi.com/anthropic",
        "apiKey": "${MINIMAX_API_KEY}",
        "api": "anthropic-messages",
        "models": [
          {
            "id": "MiniMax-M2.5",
            "name": "MiniMax M2.5",
            "reasoning": false,
            "input": ["text"],
            "contextWindow": 200000,
            "maxTokens": 8192
          }
        ]
      }
    }
  }
}
```

Global users: switch `baseUrl` to `https://api.minimax.io/anthropic`.  
Optional Codex fallback: run `openclaw models auth login --provider openai-codex` before relying on it.

✅ JSON saved.

---

## 5) Docker (only if you use sandboxing)

```bash
sudo service docker start
docker info | head
```

✅ Docker reachable (or skipped).

---

## 6) Start OpenClaw Gateway

```bash
openclaw gateway --port 18789
```

Wait until logs show the gateway listening. Capture the auth token:

```bash
grep -A0 '"token"' ~/.openclaw/openclaw.json
```

✅ Gateway running + token noted.

---

## 7) curl the gateway (new terminal)

```bash
curl -s -X POST http://127.0.0.1:18789/v1/chat/completions \
  -H "Authorization: Bearer <gateway-token>" \
  -H "Content-Type: application/json" \
  -d '{"model":"minimax/MiniMax-M2.5","messages":[{"role":"user","content":"hello"}],"max_tokens":50}' | head
```

✅ JSON with `choices`.

---

## 8) Configure `backend/.env`

```env
ASSISTANT_CHAT_PROVIDER=openclaw
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=<gateway-token>
OPENCLAW_AGENT_ID=main

# Optional media fallback:
# DOUBAO_API_KEY=...
```

✅ `.env` written.

---

## 9) Run backend + frontend

```bash
cd backend && npm run dev
```

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173`, enter Bella, send “hello”.

✅ Chat works.

---

## Troubleshooting

| Issue | What to check |
|-------|----------------|
| Gateway parse errors | Valid JSON in `openclaw.json`, key inserted |
| curl → 401 | Token mismatch vs `gateway.auth.token` |
| App says OpenClaw empty | Gateway running? `.env` token correct? |
| Wrong persona | `~/.openclaw/workspace/SOUL.md` contents |
| `web_fetch` SSRF blocks | DNS / proxy — [OPENCLAW_WEB_FETCH_SSRF_AND_DNS.md](OPENCLAW_WEB_FETCH_SSRF_AND_DNS.md) |

---

## Optional Windows launchers

If you maintain `.bat` helpers, document their names in your local notes. They are not portable across machines—prefer the explicit steps above for GitHub readers.

---

## Order recap

1. MiniMax key  
2. `cd` repo  
3. Copy SOUL  
4. Edit `openclaw.json`  
5. Docker (if needed)  
6. `openclaw gateway` + token  
7. `curl` test  
8. `backend/.env`  
9. `npm run dev` ×2  
10. Browser smoke test  
