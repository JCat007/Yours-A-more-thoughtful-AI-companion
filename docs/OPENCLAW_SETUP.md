# OpenClaw Gateway integration

Connect the `yours` backend to an **OpenClaw Gateway** (formerly documented as `CLAWRA_SETUP.md`).

## Scope

- Gateway startup, auth, and `backend/.env` wiring.  
- Skill index: `OPENCLAW_SKILLS_SETUP.md`.  
- Per-skill guides: `OPENCLAW_SKILL_*_SETUP.md`.

## Prerequisites

- Node.js 22+  
- [OpenClaw CLI](https://openclaw.ai/) installed  
- Gateway command works (`openclaw gateway --port 18789`)  
- Bella workspace files present (`SOUL.md`, agents, etc.)

## 1) Gateway HTTP settings

Edit `~/.openclaw/openclaw.json`:

```json
{
  "gateway": {
    "mode": "local",
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    }
  }
}
```

## 2) Authentication

- Token mode: `gateway.auth.token` ↔ `OPENCLAW_GATEWAY_TOKEN`  
- Password mode: `gateway.auth.password` ↔ `OPENCLAW_GATEWAY_PASSWORD`

## 3) Start the gateway

```bash
openclaw gateway --port 18789
```

## 4) Agents / workspaces

Use any workspace path you prefer, e.g.:

```bash
openclaw agents add bella --workspace /path/to/workspace
openclaw agents set-identity --agent main --from-identity
```

## 5) `backend/.env`

```env
ASSISTANT_CHAT_PROVIDER=openclaw
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=<gateway-token>
# or OPENCLAW_GATEWAY_PASSWORD=<password>
OPENCLAW_AGENT_ID=main
```

## 6) Smoke test

1. `openclaw gateway status` (or open `http://127.0.0.1:18789` depending on bind mode).  
2. `cd backend && npm run dev` and `cd frontend && npm run dev`.  
3. Visit `http://localhost:5173` and send a chat message.

## Troubleshooting

| Symptom | Checks |
|---------|--------|
| Empty responses / connection errors | Gateway running? `chatCompletions` enabled? Token/password matches `backend/.env`? |
