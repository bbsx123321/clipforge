#!/usr/bin/env bash
# 构建生产产物（electron-vite build → out/）
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  bash scripts/install.sh
fi

echo "[build] 构建中……"
npm run build
echo "[build] 完成，产物在 out/。"
