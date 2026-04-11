#!/bin/bash
# 将项目模板 Bella-SOUL.md 复制到 OpenClaw workspace
# 用法：在项目根目录执行 ./scripts/install-soul.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
SOURCE="${PROJECT_ROOT}/docs/templates/Bella-SOUL.md"
DEST="${HOME}/.openclaw/workspace/SOUL.md"

if [ ! -f "${SOURCE}" ]; then
  echo "错误：找不到模板文件 ${SOURCE}"
  exit 1
fi

mkdir -p "$(dirname "${DEST}")"
cp "${SOURCE}" "${DEST}"
echo "已复制 SOUL 到 ${DEST}"
echo "重启 OpenClaw Gateway 后生效。"
