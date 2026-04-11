# Bella + MiniMax (OpenClaw) setup

This guide covers:

1. **Pointing OpenClaw at MiniMax** (China vs global endpoints; API key **or** OAuth).  
2. **Installing Bella’s SOUL** (persona file for the workspace).  
3. **Running the web app** against the gateway.

---

## 1) What you need from MiniMax

Pick **one** auth path:

### A) API key (fastest)

| Item | Detail |
|------|--------|
| Console | `https://platform.minimaxi.com` (China) or `https://platform.minimax.io` (global) |
| Flow | Account → API keys → create key |
| Billing | Pay-as-you-go (multimodal) or coding/text-only plans |
| Format | `sk-...` (shown once—store safely) |

### B) OAuth (Coding Plan)

| Item | Detail |
|------|--------|
| Audience | Coding Plan subscribers |
| Flow | Enable `minimax-portal-auth`, run `openclaw onboard --auth-choice minimax-portal` |
| Endpoints | China: `api.minimaxi.com`; Global: `api.minimax.io` |

You need **either** a key **or** a completed OAuth onboarding before continuing.

---

## 2) Configure OpenClaw for MiniMax

### 2.1 API key path

```bash
export MINIMAX_API_KEY="sk-your-real-key"
nano ~/.openclaw/openclaw.json
```

Merge a `models.providers.minimax` block (China vs global `baseUrl` differs). Example skeleton:

```json
{
  "gateway": {
    "mode": "local",
    "http": { "endpoints": { "chatCompletions": { "enabled": true } } }
  },
  "env": { "MINIMAX_API_KEY": "sk-your-real-key" },
  "agents": { "defaults": { "model": { "primary": "minimax/MiniMax-M2.5" } } },
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

> China commonly uses `https://api.minimaxi.com/anthropic`; global uses `https://api.minimax.io/anthropic`.

CLI alternative:

```bash
openclaw onboard --auth-choice minimax-api
```

### 2.2 OAuth path

```bash
openclaw plugins enable minimax-portal-auth
openclaw gateway restart   # if already running
openclaw onboard --auth-choice minimax-portal
```

Pick **CN** or **Global** in the wizard.

---

## 3) Deploy Bella SOUL

```bash
mkdir -p ~/.openclaw/workspace
cp docs/templates/Bella-SOUL.md ~/.openclaw/workspace/SOUL.md
```

On Windows you can copy the same file into `\\wsl$\Ubuntu\home\<you>\.openclaw\workspace\SOUL.md`.

### Optional selfie skill

```bash
npx clawra@latest
```

Configure fal.ai when prompted; skill lands under `~/.openclaw/skills/clawra-selfie/`. Skip if you do not need generated selfies.

---

## 4) Start the gateway and test

```bash
sudo service docker start    # if you rely on sandboxing
openclaw gateway --port 18789
openclaw models list
openclaw models status
```

Chat smoke test:

```bash
curl -X POST http://127.0.0.1:18789/v1/chat/completions \
  -H "Authorization: Bearer <gateway-token>" \
  -H "Content-Type: application/json" \
  -d '{"model":"minimax/MiniMax-M2.5","messages":[{"role":"user","content":"hello"}],"max_tokens":100}'
```

Expect `choices[0].message.content`.

---

## 5) Web app `backend/.env`

```env
ASSISTANT_CHAT_PROVIDER=openclaw
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=<same-as-gateway.auth.token>
OPENCLAW_AGENT_ID=main

# Bella selfie/video still use Volcengine Doubao when configured:
# DOUBAO_API_KEY=...
# ASSISTANT_REFERENCE_IMAGE_URL=http://localhost:5173/bella-avatar.png

# Optional model override, e.g. OPENCLAW_MODEL=minimax/MiniMax-M2.5
```

---

## 6) Checklist

- [ ] MiniMax key or OAuth complete  
- [ ] `models.providers.minimax.baseUrl` matches China vs global  
- [ ] `~/.openclaw/workspace/SOUL.md` copied from `docs/templates/Bella-SOUL.md`  
- [ ] `gateway.http.endpoints.chatCompletions.enabled: true`  
- [ ] Gateway healthy (`openclaw models status`)  
- [ ] `backend/.env` uses `ASSISTANT_CHAT_PROVIDER=openclaw` with matching token  

Then start backend + frontend and open Bella in the browser.
