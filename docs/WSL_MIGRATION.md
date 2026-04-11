# Full migration to WSL

Move `yours` and OpenClaw from Windows to WSL by following these steps.

---

## Quick checklist (copy/paste)

```bash
# 1. Enter WSL
wsl

# 2. Create directory and copy project (without node_modules)
mkdir -p ~/projects
rsync -av --exclude 'node_modules' --exclude '.venv' \
  /mnt/c/Users/<you>/Desktop/yours/ \
  ~/projects/yours/
# Without rsync: cp -r /mnt/c/Users/<you>/Desktop/yours/* ~/projects/yours/

# 3. Run migration helper
cd ~/projects/yours
chmod +x scripts/wsl-migrate.sh
./scripts/wsl-migrate.sh

# 4. Start services (three terminals)
cd ~/projects/yours/backend && npm run dev   # terminal 1
cd ~/projects/yours/frontend && npm run dev  # terminal 2
openclaw gateway --port 18789                # terminal 3
```

---

## Prerequisites

- WSL2 installed (`wsl --version`).  
- Inside WSL: Node.js, npm, Python3, git.  
- On Windows you already have OpenClaw config and skills under `C:\Users\<you>\.openclaw\` (or similar).

---

## Step 1 — prepare a folder in WSL

From **PowerShell** or **Windows Terminal**:

```powershell
wsl
```

Then:

```bash
mkdir -p ~/projects
cd ~/projects
```

---

## Step 2 — copy the project (pick one)

### Option A — copy from Windows (recommended)

```bash
rsync -av --exclude 'node_modules' --exclude '.venv' \
  /mnt/c/Users/<you>/Desktop/yours/ \
  ~/projects/yours/
```

If `rsync` is missing: `sudo apt update && sudo apt install -y rsync`, or:

```bash
mkdir -p ~/projects/yours
cp -r /mnt/c/Users/<you>/Desktop/yours/* ~/projects/yours/
cp -r /mnt/c/Users/<you>/Desktop/yours/.* ~/projects/yours/ 2>/dev/null || true
rm -rf ~/projects/yours/backend/node_modules ~/projects/yours/frontend/node_modules
```

### Option B — git clone

```bash
cd ~/projects
git clone <YOUR_REPO_URL> yours
cd yours
```

---

## Step 3 — OpenClaw inside WSL

### 3.1 Directories

```bash
mkdir -p ~/.openclaw/skills
mkdir -p ~/.openclaw/workspace
```

### 3.2 Copy skills from Windows

```bash
cp -r /mnt/c/Users/<you>/.openclaw/skills/* ~/.openclaw/skills/
```

**Note:** a `.venv` built on Windows may not run in WSL. If the `pdf` skill fails, rebuild:

```bash
cd ~/.openclaw/skills/pdf
rm -rf .venv
python3 -m venv .venv
source .venv/bin/activate
pip install pypdf pdfplumber reportlab
deactivate
```

### 3.3 `openclaw.json` (WSL paths)

Create `~/.openclaw/openclaw.json` with **your** username and **your** gateway token. Example skeleton:

```json
{
  "agents": {
    "defaults": {
      "workspace": "/home/<your-linux-user>/.openclaw/workspace"
    }
  },
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback",
    "auth": { "mode": "token", "token": "<GENERATE_A_STRONG_SECRET>" },
    "nodes": {
      "denyCommands": [
        "camera.snap",
        "camera.clip",
        "screen.record",
        "calendar.add",
        "contacts.add",
        "reminders.add"
      ]
    }
  }
}
```

Replace `<your-linux-user>` with `whoami`, and set a real token. Keep `backend/.env` `OPENCLAW_GATEWAY_TOKEN` identical to `gateway.auth.token`.

### 3.4 Verify

```bash
ls -la ~/.openclaw/
ls -la ~/.openclaw/skills/
head -20 ~/.openclaw/openclaw.json
```

---

## Step 4 — install and run `yours`

### Backend

```bash
cd ~/projects/yours/backend
npm install
npx prisma generate
```

### Frontend

```bash
cd ~/projects/yours/frontend
npm install
```

### Three terminals

1. `cd ~/projects/yours/backend && npm run dev`  
2. `cd ~/projects/yours/frontend && npm run dev`  
3. `openclaw gateway --port 18789` (install CLI with `npm i -g openclaw` if needed)

### URLs

- Frontend: `http://localhost:5173`  
- Backend: `http://localhost:3001`

---

## Step 5 — path-related config

### `backend/.env`

Defaults like `OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789` are fine in WSL.

If a proxy runs on **Windows** and you need it from WSL, you may need the Windows host IP from `/etc/resolv.conf` (nameserver line) plus the proxy port—adjust per your VPN client.

### `~/.openclaw/openclaw.json`

Ensure `workspace` points at `/home/<you>/.openclaw/workspace` (or `$HOME`-expanded equivalent).

---

## Optional: `scripts/wsl-migrate.sh`

```bash
cd ~/projects/yours
chmod +x scripts/wsl-migrate.sh
./scripts/wsl-migrate.sh
```

You still start backend, frontend, and gateway manually in separate shells.

---

## FAQ

**pdf / Python errors** — rebuild the skill venv in WSL (see §3.2).

**Gateway token mismatch** — `OPENCLAW_GATEWAY_TOKEN` in `backend/.env` must equal `gateway.auth.token` in `openclaw.json`.

**Frontend cannot call API** — check `CORS_ORIGIN` matches the Vite origin (`http://localhost:5173` by default).

**Old Windows `.openclaw`** — keep as backup; delete only when you are sure WSL is the sole environment.
