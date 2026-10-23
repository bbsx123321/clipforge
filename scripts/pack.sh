#!/usr/bin/env bash
# 打包 Windows 可执行产物（exe）：
# 1. 构建应用 → out/
# 2. electron-builder 产出 dist/ 下的 NSIS 安装器与便携版 exe（FFmpeg 已内置）
# 说明：electron-builder 二进制资源默认从 GitHub 下载，网络受限时通过
#       ELECTRON_BUILDER_MIRROR 走 npmmirror 镜像。
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -d node_modules ]; then
  bash scripts/install.sh
fi

if [ ! -f resources/ffmpeg/ffmpeg.exe ]; then
  echo "[pack] resources/ffmpeg/ffmpeg.exe 缺失，执行兜底下载……"
  bash scripts/download-ffmpeg.sh
fi

echo "[pack] 构建应用……"
npm run build

echo "[pack] 打包 exe（NSIS 安装器 + 便携版）……"
# 两类镜像都要：ELECTRON_MIRROR 管 Electron 运行时 zip，ELECTRON_BUILDER_MIRROR 管 winCodeSign 等构建工具
export ELECTRON_MIRROR="${ELECTRON_MIRROR:-https://npmmirror.com/mirrors/electron/}"
export ELECTRON_BUILDER_MIRROR="${ELECTRON_BUILDER_MIRROR:-https://npmmirror.com/mirrors/electron-builder-binaries/}"
npm run pack

echo "[pack] 完成，产物在 dist/："
ls -la dist/*.exe 2>/dev/null || ls -la dist/
