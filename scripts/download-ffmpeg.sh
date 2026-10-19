#!/usr/bin/env bash
# 兜底：下载 FFmpeg（essentials build）到 resources/ffmpeg/
# 说明：本机若 PATH 已有含 ddagrab 的 ffmpeg 7.x 则无需执行；
# 分发场景使用本脚本内置二进制。若 essentials 缺 ddagrab，请改用 full build。
set -euo pipefail
cd "$(dirname "$0")/.."

DEST_DIR="resources/ffmpeg"
mkdir -p "${DEST_DIR}"

if [ -f "${DEST_DIR}/ffmpeg.exe" ]; then
  echo "[ffmpeg] 已存在 ${DEST_DIR}/ffmpeg.exe，跳过下载。"
  exit 0
fi

ZIP_URL="https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
TMP_ZIP="$(mktemp -t ffmpeg-XXXXXX.zip)"

echo "[ffmpeg] 下载 ${ZIP_URL} ……"
curl -fL --retry 3 -o "${TMP_ZIP}" "${ZIP_URL}"

echo "[ffmpeg] 解压并提取 ffmpeg.exe / ffprobe.exe ……"
TMP_DIR="$(mktemp -d)"
unzip -q "${TMP_ZIP}" -d "${TMP_DIR}"
BIN_DIR="$(find "${TMP_DIR}" -maxdepth 2 -type d -name bin | head -n 1)"
cp "${BIN_DIR}/ffmpeg.exe" "${DEST_DIR}/ffmpeg.exe"
cp "${BIN_DIR}/ffprobe.exe" "${DEST_DIR}/ffprobe.exe" 2>/dev/null || true
rm -rf "${TMP_DIR}" "${TMP_ZIP}"

echo "[ffmpeg] 完成：${DEST_DIR}/ffmpeg.exe"
"${DEST_DIR}/ffmpeg.exe" -hide_banner -version | head -n 1
