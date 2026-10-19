#!/usr/bin/env bash
# 运行单元测试（vitest，覆盖领域核心纯函数与 FFmpeg 参数 golden 快照）
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  bash scripts/install.sh
fi

echo "[test] 运行 vitest……"
npm run test
echo "[test] 完成。"
