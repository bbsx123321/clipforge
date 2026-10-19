# 桌面录屏工具（Windows 录屏 + 视频处理二合一）

Windows 桌面应用：屏幕录制与后期视频编辑一体化。技术栈：Electron + TypeScript + React 19 + Tailwind CSS v4 + FFmpeg。

架构方案与评审记录见 [discuss/architecture-plan.md](discuss/architecture-plan.md)。

## 当前进度

- **M1 已交付**：项目骨架 + 整屏/区域录制 MVP（双路音频、硬编探测回退、暂停分段、崩溃可恢复）。
- 待开发：M2 输入事件流与预览剪辑、M3 时间轴编辑器、M4 光标特效与缩放动画、M5 窗口捕获与画中画。

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
```

## 发布 exe

```bash
bash scripts/pack.sh
```

产物（`dist/`）：

- `DesktopRecordingTool Setup 0.1.0.exe`：NSIS 一键安装器
- `DesktopRecordingTool 0.1.0.exe`：便携版，双击即用

两种 exe 均已内置 FFmpeg（`resources/ffmpeg/` → 安装目录 resources），无需目标机器预装任何依赖。打包态的录制产物与日志写入 `%APPDATA%\desktop-recording-tool\`（recordings/ 与 logs/）。

## 运行依赖

- Node.js ≥ 22
- FFmpeg ≥ 6.0（需含 `ddagrab` 滤镜与硬件编码器）。开发机 PATH 已有 7.1.1 full build；分发场景用 `download-ffmpeg.sh` 内置。
- Windows 10 19041+（ddagrab 依赖 Desktop Duplication API）

## 目录结构

```
src/
├─ main/        # Electron 主进程：窗口、IPC、录制编排、冒烟
├─ preload/     # contextBridge 桥（最小暴露面）
├─ renderer/    # React UI：控制悬浮条、区域选区、音频采集
├─ core/        # 领域核心（纯函数，无 electron 依赖）
│  └─ recording/
├─ recorder/    # 平台层：FFmpeg 参数/探测/会话/WAV 写入
└─ shared/      # 跨进程类型契约
```

## 录制产物协议

每次录制产出独立目录（输出位置可在设置中更改）：

- `screen-001.mp4 …`：分段屏幕视频（**录音开启时音轨已内嵌合成**；暂停/恢复产生新分段，每段各自对齐音频区间）
- `audio-mix.wav`：独立混音文件（仅在音频合成失败时保留作兜底；正常情况合成成功后自动删除）
- `session.json`：清单（设置、分段与时间偏移、警告）

录制管线说明：录制期视频写 **MKV**（流式封装：崩溃安全，且规避 fragmented MP4 小块写模式被安全软件磁盘过滤挂起的问题——已实测），停止时无损 remux 为 MP4（`-c copy` 秒级），再将混音 WAV 按分段偏移合入（视频流零重编码、音频转 AAC），即 OBS 的「录 MKV + 收尾转 MP4」同款策略。
