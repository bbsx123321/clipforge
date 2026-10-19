#!/usr/bin/env bash
# 全量类型检查（strict TypeScript）
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  bash scripts/install.sh
fi

echo "[typecheck] 运行 tsc --noEmit……"
npm run typecheck
echo "[typecheck] 通过。"
