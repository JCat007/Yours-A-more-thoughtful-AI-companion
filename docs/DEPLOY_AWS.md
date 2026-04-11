# Deploy On AWS (EC2 + systemd + OpenClaw Gateway)

This guide deploys the project on an Ubuntu EC2 host and keeps OpenClaw Gateway managed by systemd.

## 1) Launch EC2

- OS: Ubuntu 24.04 LTS
- Instance: at least 2 vCPU / 4 GB RAM (recommended 4 vCPU / 8 GB RAM for smoother office/pdf tooling)
- Security group:
  - `22/tcp` from your IP (SSH)
  - App ports only if needed (for example `3001`, `5173`) behind your own network policy

## 2) Connect And Bootstrap

```bash
ssh -i /path/to/key.pem ubuntu@<EC2_PUBLIC_IP>
sudo apt-get update
sudo apt-get install -y git curl
```

## 3) Clone Project

```bash
git clone <YOUR_REPO_URL> ~/yours
cd ~/yours
```

## 4) Install System Dependencies

```bash
chmod +x scripts/setup-system-deps.sh
./scripts/setup-system-deps.sh
```

This installs and verifies key binaries used by skills (`ffmpeg`, `pandoc`, `pdftoppm`, `tesseract`, `qpdf`, `soffice`).

## 5) Install Node + OpenClaw CLI

```bash
sudo apt-get install -y nodejs npm
npm config set prefix "$HOME/.npm-global"
echo 'export PATH="$HOME/.npm-global/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
npm install -g openclaw
openclaw --version
```

## 6) Setup Shared Python venv For Skills

```bash
export PYTHON_SKILLS_VENV="${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}"
chmod +x scripts/setup-openclaw-python-venv.sh
./scripts/setup-openclaw-python-venv.sh
```

Persist env:

```bash
echo 'export PYTHON_SKILLS_VENV="${PYTHON_SKILLS_VENV:-$HOME/.openclaw/venvs/python-skills}"' >> ~/.bashrc
source ~/.bashrc
```

## 7) Install/Sync Skills And Config

```bash
chmod +x scripts/wsl-migrate.sh
./scripts/wsl-migrate.sh
node scripts/openclaw-apply-china-world.js
```

## 8) Configure Secrets

Edit `~/.openclaw/openclaw.json` and set real keys where needed:

- `MINIMAX_API_KEY`
- `DOUBAO_API_KEY` / `ARK_API_KEY`
- any other provider keys you use

## 9) Install Gateway Service (systemd)

```bash
openclaw gateway install --force
openclaw doctor --repair
openclaw gateway start
openclaw gateway status
```

Useful logs:

```bash
journalctl --user -u openclaw-gateway.service -n 200 --no-pager
```

## 10) Runtime Checks

```bash
echo "$PYTHON_SKILLS_VENV"
"$PYTHON_SKILLS_VENV/bin/python" -c "import markitdown; print(markitdown.__file__)"
which ffmpeg pandoc pdftoppm tesseract qpdf soffice
openclaw gateway status
```

## 11) Optional: Start Backend/Frontend

```bash
cd ~/yours
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

Then run your app processes using your preferred process manager (`pm2`, `systemd`, docker, etc.).

## Troubleshooting

- Gateway shows stopped but port responds:
  - stop all old processes and restart service:
  - `openclaw gateway stop || true`
  - `pkill -f "openclaw.*gateway" || true`
  - `openclaw gateway start`
- Python packages not found:
  - confirm venv path:
  - `echo "$PYTHON_SKILLS_VENV"`
  - `"$PYTHON_SKILLS_VENV/bin/python" -m pip -V`
- Office/PDF command missing:
  - rerun `./scripts/setup-system-deps.sh`
