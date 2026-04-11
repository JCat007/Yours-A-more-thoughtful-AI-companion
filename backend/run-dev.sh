#!/usr/bin/env bash
set -euo pipefail

# gbrain is often installed via `bun add -g`; ensure the CLI is on PATH for subprocess spawns.
if [ -n "${HOME:-}" ] && [ -d "$HOME/.bun/bin" ]; then
  case ":${PATH:-}:" in
    *:"$HOME/.bun/bin":*) ;;
    *) export PATH="$HOME/.bun/bin:$PATH" ;;
  esac
fi

# Avoid proxies (MiniMax China)
unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy

# OpenClaw env (China mode defaults)
export OPENCLAW_GATEWAY_URL=http://127.0.0.1:18789
export OPENCLAW_MODEL_CHINA=minimax-cn/MiniMax-M2.7
export OPENCLAW_AGENT_ID=main-china
unset OPENCLAW_MODEL_FALLBACKS

# Read gateway token from ~/.openclaw/openclaw.json if present
OPENCLAW_TOKEN_FROM_CFG=""
if command -v node >/dev/null 2>&1; then
  set +e
  OPENCLAW_TOKEN_FROM_CFG="$(node -e "try{const p=(process.env.HOME||process.env.USERPROFILE)+'/.openclaw/openclaw.json';const j=require(p);const t=j&&j.gateway&&j.gateway.auth&&j.gateway.auth.token;process.stdout.write(t||'')}catch(e){process.exit(0)}")"
  set -e
fi
if [ -n "$OPENCLAW_TOKEN_FROM_CFG" ]; then
  export OPENCLAW_GATEWAY_TOKEN="$OPENCLAW_TOKEN_FROM_CFG"
fi

echo "OPENCLAW_MODEL_CHINA=$OPENCLAW_MODEL_CHINA"
echo "OPENCLAW_AGENT_ID=$OPENCLAW_AGENT_ID"
[ -n "${OPENCLAW_GATEWAY_TOKEN-}" ] && echo "OPENCLAW_GATEWAY_TOKEN=******" || echo "OPENCLAW_GATEWAY_TOKEN=(empty)"

npm run dev
