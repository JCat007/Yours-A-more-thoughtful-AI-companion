# OpenClaw upgrade + agent tool sandbox (Docker)

Two goals:

1. **Update OpenClaw** to the latest GitHub `main` (dev) or the latest stable npm release.  
2. **Enable “plan A” sandboxing** — run agent tools inside Docker for all sessions (or for non-main sessions only).

---

## Requirements

- **Node.js 22+**  
- **Docker** installed and running (Docker Desktop with WSL2 backend on Windows is typical).  
- Run OpenClaw **inside WSL/Linux** so `scripts/sandbox-setup.sh` and Docker behave predictably.

---

## Step 1 — upgrade OpenClaw

### Dev channel (git `main`)

```bash
openclaw update --channel dev
```

Uses/clones `~/openclaw` (override with `OPENCLAW_GIT_DIR`), rebases, rebuilds, reinstalls the global CLI.

### Stable channel (npm `latest`)

```bash
openclaw update --channel stable
```

### Check status

```bash
openclaw update status
```

---

## Step 2 — build the sandbox image

Build from the OpenClaw source tree:

- After **dev** update, sources usually live in `~/openclaw`.  
- After **stable-only** npm install, clone manually:

```bash
git clone https://github.com/openclaw/openclaw.git ~/openclaw
cd ~/openclaw
```

Then:

```bash
cd ~/openclaw   # or your OPENCLAW_GIT_DIR
./scripts/sandbox-setup.sh
```

Produces `openclaw-sandbox:bookworm-slim`. Requires `docker info` to succeed for your user.

---

## Step 3 — enable sandboxing in `openclaw.json`

Edit `%USERPROFILE%\.openclaw\openclaw.json` (Windows) or `~/.openclaw/openclaw.json` (WSL).

Example — **sandbox every session** (maximum isolation). For “sandbox everyone except `main`”, set `"mode": "non-main"`.

```json
{
  "agents": {
    "defaults": {
      "sandbox": {
        "mode": "all",
        "scope": "session",
        "workspaceAccess": "none",
        "docker": {
          "image": "openclaw-sandbox:bookworm-slim",
          "network": "none",
          "readOnlyRoot": true
        }
      }
    }
  }
}
```

| Field | Suggested | Meaning |
|-------|-------------|---------|
| `mode` | `"all"` / `"non-main"` | Who runs tools in Docker |
| `scope` | `"session"` | One container per session |
| `workspaceAccess` | `"none"` | Do not mount host workspace into tools |
| `docker.image` | `openclaw-sandbox:bookworm-slim` | Image from step 2 |
| `docker.network` | `"none"` | No outbound network from the sandbox |
| `docker.readOnlyRoot` | `true` | Read-only root FS |

Merge into existing JSON — keep `gateway`, `channels`, etc.

---

## Step 4 — restart gateway + verify

```bash
openclaw gateway restart
# or stop + start:
openclaw gateway --port 18789
```

Diagnostics:

```bash
openclaw sandbox explain
openclaw sandbox list
```

Containers appear after a session actually invokes sandboxed tools.

---

## Working with Bella (`yours`)

`OPENCLAW_GATEWAY_URL` stays the same; only **where tools execute** changes (inside Docker). Chat Completions flow is unchanged.

---

## FAQ

**No bash on Windows host** — run updates and `./scripts/sandbox-setup.sh` from WSL; keep `~/.openclaw/openclaw.json` there too.

**`sandbox list` empty** — trigger a tool-heavy task first.

**Need outbound network inside sandbox** — switch `docker.network` to `bridge` (understand the security tradeoff).

---

## References

- [OpenClaw sandboxing](https://docs.openclaw.ai/gateway/sandboxing)  
- [OpenClaw security](https://docs.openclaw.ai/security)  
- [OpenClaw update channels](https://docs.openclaw.ai/cli/update)
