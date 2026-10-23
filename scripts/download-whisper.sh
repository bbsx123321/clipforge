#!/usr/bin/env bash
# 下载 whisper.cpp（whisper-cli.exe，CPU x64）与 base 量化模型到 resources/whisper/
# 供字幕语音识别使用；已存在则跳过。CI 与本机首次开发前执行一次。
set -euo pipefail
cd "$(dirname "$0")/.."

DEST_DIR="resources/whisper"
mkdir -p "${DEST_DIR}"

# whisper.cpp 的预编译二进制发布在 build 号 Release 上（非 vX.Y.Z tag）
# 官方 zip 的 Release/ 目录内含 whisper-cli.exe 与全套依赖 DLL（ggml-*.dll 等），
# 必须整套拷贝（只拷 exe 会报缺 api-ms-win-crt / ggml 动态库）
WHISPER_RELEASE="b5454"
ZIP_PATH="ggml-org/whisper.cpp/releases/download/${WHISPER_RELEASE}/whisper-bin-x64.zip"
ZIP_URLS=(
  "https://github.com/${ZIP_PATH}"
  "https://gh-proxy.com/https://github.com/${ZIP_PATH}"
  "https://ghproxy.net/https://github.com/${ZIP_PATH}"
)
# base 模型 q5_1 量化（约 57MB，中文质量与体积的平衡点）
# HF 直连在本机网络常超时，依次尝试官方 → hf-mirror 镜像（CI 上直连即可成功）
MODEL_PATH="ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin"
MODEL_URLS=(
  "https://huggingface.co/${MODEL_PATH}"
  "https://hf-mirror.com/${MODEL_PATH}"
)
MODEL_FILE="ggml-base-q5_1.bin"

download_first_ok () {
  local dest="$1"
  shift
  for url in "$@"; do
    echo "[whisper] 下载 ${url} ……"
    if curl -fL --retry 2 --connect-timeout 20 -o "${dest}" "${url}"; then
      return 0
    fi
    echo "[whisper] 该线路失败，尝试下一个 ……"
  done
  return 1
}

if [ ! -f "${DEST_DIR}/whisper-cli.exe" ] || [ -z "$(ls "${DEST_DIR}"/*.dll 2>/dev/null)" ]; then
  TMP_ZIP="$(mktemp -t whisper-XXXXXX.zip)"
  if ! download_first_ok "${TMP_ZIP}" "${ZIP_URLS[@]}"; then
    echo "[whisper] 错误：二进制全部下载线路失败" >&2
    exit 1
  fi
  echo "[whisper] 解压并提取 whisper-cli.exe 与全部依赖 DLL ……"
  TMP_DIR="$(mktemp -d)"
  unzip -q "${TMP_ZIP}" -d "${TMP_DIR}"
  RELEASE_DIR="$(find "${TMP_DIR}" -maxdepth 2 -type d -name Release | head -n 1)"
  if [ -z "${RELEASE_DIR}" ]; then
    echo "[whisper] 错误：压缩包内未找到 Release 目录" >&2
    exit 1
  fi
  cp "${RELEASE_DIR}/whisper-cli.exe" "${DEST_DIR}/whisper-cli.exe"
  cp "${RELEASE_DIR}"/*.dll "${DEST_DIR}/"
  rm -rf "${TMP_DIR}" "${TMP_ZIP}"
  echo "[whisper] 完成：${DEST_DIR}/whisper-cli.exe + $(ls "${DEST_DIR}"/*.dll | wc -l) 个 DLL"
else
  echo "[whisper] 已存在 whisper-cli.exe 与依赖 DLL，跳过。"
fi

if [ ! -f "${DEST_DIR}/${MODEL_FILE}" ]; then
  if ! download_first_ok "${DEST_DIR}/${MODEL_FILE}" "${MODEL_URLS[@]}"; then
    echo "[whisper] 错误：模型全部下载线路失败" >&2
    exit 1
  fi
  echo "[whisper] 完成：${DEST_DIR}/${MODEL_FILE}"
else
  echo "[whisper] 已存在 ${DEST_DIR}/${MODEL_FILE}，跳过。"
fi
