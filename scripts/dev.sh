#!/usr/bin/env bash
# 开发模式启动（electron-vite dev，热重载），日志输出到 logs/
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  echo "[dev] 未发现 node_modules，先执行依赖安装……"
  bash scripts/install.sh
fi

mkdir -p logs
echo "[dev] 启动开发模式……"
exec npm run dev
