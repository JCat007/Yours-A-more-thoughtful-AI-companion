#!/bin/bash
# WSL 迁移脚本：将项目 skills 安装到 ~/.openclaw，配置 openclaw.json 和 Bella SOUL
# 用法：在 WSL 项目根目录执行 chmod +x scripts/wsl-migrate.sh && ./scripts/wsl-migrate.sh

set -e

# 检测是否在 WSL 中
if ! grep -qE '(Microsoft|WSL)' /proc/version 2>/dev/null; then
  echo "警告：当前可能不在 WSL 环境中。继续执行..."
fi

WSL_USER=$(whoami)
WSL_HOME="$HOME"
WSL_OPENCLAW="${WSL_HOME}/.openclaw"
WSL_SKILLS="${WSL_OPENCLAW}/skills"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== WSL OpenClaw 安装脚本 ==="
echo "WSL OpenClaw:     ${WSL_OPENCLAW}"
echo "WSL 用户:         ${WSL_USER}"
echo "项目目录:         ${PROJECT_ROOT}"
echo ""

# Step 1: 创建 WSL OpenClaw 目录
echo "[1/5] 创建 ~/.openclaw 目录..."
mkdir -p "${WSL_OPENCLAW}/skills"
mkdir -p "${WSL_OPENCLAW}/workspace"

# Step 2: 从项目安装 skills（全部带 SKILL.md 的目录都复制）
echo "[2/5] 从项目安装 skills 到 ~/.openclaw/skills（按 SKILL.md 自动发现）..."
skills_found=$(ls -1 "${PROJECT_ROOT}/skills" 2>/dev/null || true)
for maybe_dir in ${skills_found}; do
  if [ -d "${PROJECT_ROOT}/skills/${maybe_dir}" ] && [ -f "${PROJECT_ROOT}/skills/${maybe_dir}/SKILL.md" ]; then
    cp -r "${PROJECT_ROOT}/skills/${maybe_dir}" "${WSL_SKILLS}/"
    echo "  - 已安装: ${maybe_dir}"
  fi
done

# Extra chmod for weather script if present.
if [ -d "${WSL_SKILLS}/weather/scripts" ] && [ -f "${WSL_SKILLS}/weather/scripts/weather.sh" ]; then
  chmod +x "${WSL_SKILLS}/weather/scripts/weather.sh" 2>/dev/null || true
fi

echo "  - 当前 skills: $(ls "${WSL_SKILLS}" 2>/dev/null | tr '\n' ' ')"

# Step 3: 创建 openclaw.json
echo "[3/5] 创建 ~/.openclaw/openclaw.json（WSL 路径）..."
cat > "${WSL_OPENCLAW}/openclaw.json" << EOF
{
  "meta": {"lastTouchedVersion":"2026.2.9","lastTouchedAt":"2026-02-12T09:33:23.853Z"},
  "wizard": {"lastRunAt":"2026-02-12T09:33:23.839Z","lastRunVersion":"2026.2.9","lastRunCommand":"doctor","lastRunMode":"local"},
  "agents": {
    "defaults": {
      "workspace": "${WSL_HOME}/.openclaw/workspace",
      "compaction": {"mode":"safeguard"},
      "maxConcurrent": 4,
      "subagents": {"maxConcurrent": 8}
    }
  },
  "messages": {"ackReactionScope":"group-mentions"},
  "commands": {"native":"auto","nativeSkills":"auto"},
  "gateway": {
    "port": 18789,
    "mode": "local",
    "bind": "loopback",
    "auth": {"mode":"token","token":"68d192d349801a0a3a73d635c55a5635ae12ce42429cf660"},
    "tailscale": {"mode":"off","resetOnExit": false},
    "nodes": {"denyCommands":["camera.snap","camera.clip","screen.record","calendar.add","contacts.add","reminders.add"]}
  },
  "skills": {
    "install": {"nodeManager":"npm"},
    "entries": {
      "web-to-markdown": {"enabled":true,"env":{"SKILLS_ROOT":"${WSL_HOME}/.openclaw/skills"}},
      "pdf": {"enabled":true},
      "weather": {"enabled":true,"env":{"WEATHER_MODE":"china","WEATHER_PROXY":"http://127.0.0.1:7890","SKILLS_ROOT":"${WSL_HOME}/.openclaw/skills"}},
      "seedream": {"enabled":true,"env":{"ARK_API_KEY":"YOUR_ARK_OR_DOUBAO_API_KEY"}},
      "seedance": {"enabled":true,"env":{"ARK_API_KEY":"YOUR_ARK_OR_DOUBAO_API_KEY"}}
    }
  },
  "env": {
    "HTTP_PROXY":"http://127.0.0.1:7890",
    "HTTPS_PROXY":"http://127.0.0.1:7890"
  }
}
EOF

echo "  注意：请编辑 ~/.openclaw/openclaw.json，将 seedream/seedance 的 YOUR_ARK_OR_DOUBAO_API_KEY 替换为你的火山方舟或豆包 API Key"

# Step 3b: 复制 Bella SOUL 到 workspace
echo "[3b] 复制 Bella SOUL 到 ~/.openclaw/workspace/SOUL.md..."
if [ -f "${PROJECT_ROOT}/docs/templates/Bella-SOUL.md" ]; then
  cp "${PROJECT_ROOT}/docs/templates/Bella-SOUL.md" "${WSL_OPENCLAW}/workspace/SOUL.md"
  echo "  - 已复制 Bella-SOUL.md"
else
  echo "  警告: docs/templates/Bella-SOUL.md 不存在，跳过"
fi

# Step 3c: 合并 openclaw-china-world 模板，确保 canvas-design/docx/frontend-design/pptx/xlsx 等 skills 在 openclaw.json 中 enabled
echo "[3c] 合并 openclaw-china-world 配置到 ~/.openclaw/openclaw.json（确保 file skills enabled）..."
node "${PROJECT_ROOT}/scripts/openclaw-apply-china-world.js"

# Step 4: 可选 - 重建 pdf skill 的 venv（若 pdf 存在）
if [ -d "${WSL_SKILLS}/pdf" ]; then
  echo "[4/5] 检查 pdf skill venv..."
  if [ ! -f "${WSL_SKILLS}/pdf/.venv/bin/python" ]; then
    echo "  - 重建 pdf venv（Windows venv 在 WSL 中不可用）..."
    cd "${WSL_SKILLS}/pdf"
    rm -rf .venv 2>/dev/null || true
    python3 -m venv .venv
    .venv/bin/pip install -q pypdf pdfplumber reportlab
    cd "${PROJECT_ROOT}"
  else
    echo "  - pdf venv 已存在，跳过"
  fi
else
  echo "[4/5] 跳过 pdf venv（pdf skill 不存在）"
fi

# Step 5: 安装项目 npm 依赖
echo "[5/5] 安装 backend、frontend 及根目录依赖..."
cd "${PROJECT_ROOT}" && npm install 2>/dev/null || true
cd "${PROJECT_ROOT}/backend" && npm install
npx prisma generate 2>/dev/null || true
cd "${PROJECT_ROOT}/frontend" && npm install

echo ""
echo "=== 迁移完成 ==="
echo ""
echo "一键启动（推荐）："
echo "  Windows: 双击 启动项目.bat"
echo "  WSL:     cd ${PROJECT_ROOT} && bash scripts/start-all.sh"
echo ""
echo "或手动分终端启动："
echo "  终端 1 - Backend:   cd ${PROJECT_ROOT}/backend && npm run dev"
echo "  终端 2 - Frontend:  cd ${PROJECT_ROOT}/frontend && npm run dev"
echo "  终端 3 - Gateway:   openclaw gateway --port 18789"
echo ""
echo "访问：http://localhost:5173"
echo ""
