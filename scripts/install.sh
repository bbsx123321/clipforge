#!/usr/bin/env bash
# 安装项目依赖（唯一入口，其他脚本均通过本脚本保证 node_modules 就绪）
set -euo pipefail
cd "$(dirname "$0")/.."

echo "[install] 安装依赖中……"
npm install --no-fund --no-audit
echo "[install] 完成。"
