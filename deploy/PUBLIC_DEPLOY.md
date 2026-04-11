# Public deployment (recommended shape)

Goals:

- **OpenClaw Gateway** listens on loopback only (`127.0.0.1:18789`), not on the public internet.  
- **Backend** is reachable from the internet (ideally behind Nginx/Cloudflare) with auth + rate limits on `/api/assistant/*`.  
- **Frontend** is static hosting (CDN/S3/etc.).

---

## 1) OpenClaw Gateway — loopback + non-root user

### Prerequisites

- Install the `openclaw` CLI on the server.  
- Create a dedicated user (example: `openclaw`).  
- Configuration lives at `/home/openclaw/.openclaw/openclaw.json` (adjust per user).

### Key `openclaw.json` fields

- `gateway.bind`: `"loopback"`  
- `gateway.auth.mode`: `"token"`  
- `gateway.auth.token`: long random secret  
- `gateway.http.endpoints.chatCompletions.enabled`: `true`  
- `tools.exec.host`: `"gateway"` (when skills need exec)

> Whichever OS user launches the gateway owns `~/.openclaw/*`.

### systemd

See `deploy/openclaw-gateway.service` as a non-root template.

---

## 2) Backend — protect `/api/assistant/*`

Built-in controls (no extra dependencies):

- **Auth:** set `BACKEND_API_KEY`; clients must send `x-api-key` or `Authorization: Bearer`.  
- **Rate limit:** default 20 requests / 60s per IP (in-memory). Tune with `ASSISTANT_RATE_LIMIT_WINDOW_MS` / `ASSISTANT_RATE_LIMIT_MAX`.

> Same middleware applies to `/api/ifly/*` and `/api/asr/*`—configure `VITE_BACKEND_API_KEY` in the frontend when these routes are used.

### Reverse proxies

Set `TRUST_PROXY=1` (or higher) so `req.ip` reflects the client when behind Nginx/Cloudflare—otherwise rate limits collapse to the proxy IP.

---

## 3) Backend → gateway (private network)

In `backend/.env`:

```env
OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
OPENCLAW_GATEWAY_TOKEN=<gateway.auth.token>
OPENCLAW_AGENT_ID=main-china   # or main-world — align with openclaw.json agents.list
```

---

## 4) Minimal attack surface

- **Do not** expose TCP `18789` on public security groups.  
- Public listeners should be `80/443` (reverse proxy) only.  
- Optionally bind the Node port to localhost and let Nginx terminate TLS upstream.

---

## 5) Multiple backend instances

`/api/assistant` rate limiting is an **in-memory map** (single host). For horizontal scale:

- Move throttling to Nginx/Cloudflare/WAF, **or**  
- Replace with a shared store (Redis, etc.).
