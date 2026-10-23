# ClipForge 剪录坊（Windows 录屏 + 剪辑 + 字幕三合一）

Windows 桌面应用：屏幕录制、轻量剪辑、语音识别字幕一体化。技术栈：Electron + TypeScript + React 19 + Tailwind CSS v4 + FFmpeg + whisper.cpp。

架构方案与评审记录见 [discuss/architecture-plan.md](discuss/architecture-plan.md)。官网：https://clipforge-bhg.pages.dev/

## 功能总览

- **录制**：整屏 / 框选区域 / 软件窗口捕获；系统声音 + 麦克风双路混音；暂停=分段；捕获健康检测自动重试；3 秒倒计时 + 托盘常驻；全局快捷键（默认 F10 开始/停止、F11 暂停，可自定义）
- **剪辑**：内嵌播放器 + 时间轴（视频轨 / 声音波形轨 / 字幕轨）；裁剪、选区加速、删除、撤销；剪辑进度随工程文件自动保存
- **字幕**：开启麦克风录制，停止后自动 whisper 语音识别生成带时间戳字幕（完全离线，本地 base 模型）；字幕可编辑文本 / 拖动时间 / 增删；样式可调（黑底白字、字号、位置、边距、透明度）；导出支持烧录进画面 / 独立 .srt / MP4 软字幕轨
- **中英双语**界面即时切换

## 快速开始

所有启停操作一律通过 `scripts/` 下的脚本（不要直接使用 npm/electron 命令）：

```bash
bash scripts/install.sh          # 安装依赖
bash scripts/dev.sh              # 开发模式（热重载），日志输出 logs/main.log
bash scripts/typecheck.sh        # 严格类型检查
bash scripts/test.sh             # 单元测试（vitest）
bash scripts/build.sh            # 构建生产产物到 out/
bash scripts/smoke.sh            # 冒烟验证：自动整屏录制 10 秒并校验产物
bash scripts/pack.sh             # 打包 Windows exe（NSIS 安装器 + 便携版 → dist/）
bash scripts/download-ffmpeg.sh  # 兜底：下载 FFmpeg 到 resources/ffmpeg/（PATH 已有 ffmpeg 7.x 时无需）
bash scripts/download-whisper.sh # 兜底：下载 whisper.cpp + base 模型到 resources/whisper/（字幕识别）
```

字幕全链路冒烟（TTS 合成语音 → 识别 → 编辑器 → 三方式导出）：

```bash
npx electron . --smoke-subtitle   # 退出码 0 = 全部检查点通过（需先跑 download-whisper.sh）
```

## 发布 exe

```bash
bash scripts/pack.sh
```

产物（`dist/`）：`ClipForge Setup <版本>.exe`（NSIS 一键安装器）与 `ClipForge <版本>.exe`（便携版）。

两种 exe 均内置 FFmpeg 与 whisper 模型（安装目录 resources），无需目标机器预装任何依赖、无需联网。打包态的录制产物与日志写入 `%APPDATA%\ClipForge\`（recordings/ 与 logs/）。

云端发版：升 package.json 版本 → commit → `git tag -fa vX.Y.Z && git push -ff origin main vX.Y.Z` → CI 自动构建并发布 Release（自动下载 FFmpeg / whisper 资源）。

## 运行依赖

- Node.js ≥ 22
- FFmpeg ≥ 6.0（需含 `ddagrab` 滤镜；开发机用 `download-ffmpeg.sh` 内置）
- whisper.cpp（字幕识别用；`download-whisper.sh` 下载二进制 + ggml base 量化模型，缺失时字幕功能自动降级、不影响录制）
- Windows 10 19041+（ddagrab 依赖 Desktop Duplication API）

## 目录结构

```
src/
├─ main/        # Electron 主进程：窗口、IPC、录制编排、字幕识别服务、冒烟
├─ preload/     # contextBridge 桥（最小暴露面）
├─ renderer/    # React UI：控制悬浮条、编辑器（三轨时间轴）、音频采集
├─ core/        # 领域核心（纯函数，无 electron 依赖）
│  ├─ recording/
│  ├─ editing/
│  ├─ exporting/
│  └─ subtitles/
├─ recorder/    # 平台层：FFmpeg 参数/探测/会话/WAV 写入、whisper 运行
└─ shared/      # 跨进程类型契约
```

## 录制产物协议

每次录制产出独立目录（输出位置可在设置中更改）：

- `screen-001.mp4 …`：分段屏幕视频（录音开启时音轨已内嵌合成；暂停/恢复产生新分段，每段各自对齐音频区间）
- `mic.wav`：麦克风独立音频（字幕识别源；识别成功后自动删除，失败保留供重试）
- `audio-mix.wav`：独立混音文件（仅在音频合成失败时保留作兜底）
- `session.json`：清单（设置、分段与时间偏移、警告）
- `screen-001.edit.json …`：编辑工程文件（剪辑片段 + 字幕 cues + 样式 + 波形 + 识别状态；编辑器自动保存与恢复）

录制管线说明：录制期视频写 **MKV**（流式封装：崩溃安全，且规避 fragmented MP4 小块写模式被安全软件磁盘过滤挂起的问题——已实测），停止时无损 remux 为 MP4（`-c copy` 秒级），再将混音 WAV 按分段偏移合入（视频流零重编码、音频转 AAC），即 OBS 的「录 MKV + 收尾转 MP4」同款策略。字幕管线：麦克风 PCM 全程独立落盘 → 停止后切 16kHz 单声道 → whisper.cpp 本地识别（进度实时上报编辑器）→ cues 写入工程文件。

## 开源声明

应用内置于分发包中的 [FFmpeg](https://ffmpeg.org)（BtbN FFmpeg-Builds，**GPL v3** 构建）与 [whisper.cpp](https://github.com/ggml-org/whisper.cpp)（MIT）及其 ggml base 模型。FFmpeg 依 GPL v3 以可执行形式随应用分发，源码获取方式见上述链接；本应用通过命令行子进程调用、未做静态链接。
