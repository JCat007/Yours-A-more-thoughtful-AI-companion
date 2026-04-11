#!/bin/bash
# 一键启动热点聚合项目（WSL）
# 启动：Backend、Frontend、OpenClaw Gateway
# 用法：bash scripts/start-all.sh 或 ./scripts/start-all.sh
# 关闭终端或 Ctrl+C 时，Gateway 会随脚本一起停止

# 关闭 set -e 便于看到完整错误（concurrently 子进程失败时不应导致脚本静默退出）
# set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT" || { echo "[start-all] 错误: 无法 cd 到 $PROJECT_ROOT (当前: $(pwd))"; exit 1; }

# 停止 Gateway：仅按端口杀进程（不调用 openclaw gateway stop，避免 "Gateway service disabled" 干扰）
stop_gateway() {
  echo ""
  echo "[start-all] 正在停止 OpenClaw Gateway..."
  if command -v lsof &>/dev/null; then
    GATEWAY_PID=$(lsof -ti:18789 2>/dev/null)
    if [ -n "$GATEWAY_PID" ]; then
      kill -9 $GATEWAY_PID 2>/dev/null || true
      sleep 1
    fi
  elif command -v fuser &>/dev/null; then
    fuser -k 18789/tcp 2>/dev/null || true
    sleep 1
  fi
}

trap stop_gateway EXIT

# 启动前先停掉可能存在的旧 Gateway
stop_gateway

echo "[start-all] 项目目录: $PROJECT_ROOT"

# 确保 concurrently 可用（项目根或 npx）
if [ -f "${PROJECT_ROOT}/node_modules/.bin/concurrently" ]; then
  CONCURRENTLY="${PROJECT_ROOT}/node_modules/.bin/concurrently"
else
  CONCURRENTLY="npx --yes concurrently"
fi
echo "[start-all] 使用: $CONCURRENTLY"

# 检查 node 可用
command -v node &>/dev/null || { echo "[start-all] 错误: 未找到 node，请先安装 Node.js"; exit 1; }

echo "========================================="
echo "  热点聚合 - 一键启动"
echo "========================================="
echo ""
echo "  项目路径: $PROJECT_ROOT"
echo "  访问地址: http://localhost:5173"
echo ""
echo "  服务: Backend + Frontend + OpenClaw Gateway"
echo ""
echo "  按 Ctrl+C 停止所有服务"
echo "========================================="
echo ""

# --kill-others-on-fail=false: Gateway 失败时保持 backend/frontend 运行，可另开终端手动启动 Gateway
$CONCURRENTLY --kill-others-on-fail=false -n "backend,frontend,gateway" -c "blue,green,yellow" \
  "cd ${PROJECT_ROOT}/backend && npm run dev" \
  "cd ${PROJECT_ROOT}/frontend && npm run dev" \
  "openclaw gateway --port 18789"
