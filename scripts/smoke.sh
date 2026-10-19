#!/usr/bin/env bash
# 冒烟验证：构建后以 --smoke 参数启动应用，自动整屏录制 10 秒并校验产物时长
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  bash scripts/install.sh
fi

echo "[smoke] 构建产物……"
npm run build

echo "[smoke] 启动冒烟录制（约 15 秒）……"
npx electron . --smoke

# 冒烟产物固定写入 logs/smoke/，最近一次 session 目录取最新
echo "[smoke] 校验产物……"
LATEST_DIR="$(ls -1dt logs/smoke/*/ 2>/dev/null | head -n 1 || true)"
if [ -z "${LATEST_DIR}" ]; then
  echo "[smoke] 失败：未找到冒烟产物目录 logs/smoke/<session>/"
  exit 1
fi

SCREEN_FILE="${LATEST_DIR}screen-001.mp4"
if [ ! -f "${SCREEN_FILE}" ]; then
  echo "[smoke] 失败：未找到视频文件 ${SCREEN_FILE}"
  exit 1
fi

DURATION="$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${SCREEN_FILE}" 2>/dev/null || echo 0)"
echo "[smoke] 视频时长：${DURATION}s（期望 ≥ 8s）"

PASSED="$(awk -v d="${DURATION}" 'BEGIN{print (d>=8)?1:0}')"
if [ "${PASSED}" != "1" ]; then
  echo "[smoke] 失败：视频时长不足 8 秒"
  exit 1
fi

echo "[smoke] 通过。产物目录：${LATEST_DIR}"
