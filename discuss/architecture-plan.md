# Windows 录屏 + 视频处理二合一软件 —— 架构方案

> 状态：当前主方案（技术栈：Electron + TypeScript + FFmpeg）
> 日期：2026-10-16
> 前序：C# WinUI 3 方案已存档至 [architecture-plan-csharp-winui3.md](./architecture-plan-csharp-winui3.md)，其领域模型与录制文件协议在本方案中继续适用。
> 对标产品：Cap（开源）、Screen Studio（商业）、OBS。

---

## 1. 技术栈定案

| 层 | 选型 | 说明 |
|----|------|------|
| 桌面宿主 | Electron 最新稳定版 | 主进程 Node **ESM**（Electron 28+ 原生支持，全项目无 commonjs） |
| 语言 | TypeScript 5.x 全栈 | 主进程 / 渲染进程 / 子进程统一，`strict` 全开 |
| UI | React 19 + Tailwind CSS v4 | 版本遵循开发规则强制要求 |
| 构建 | electron-vite + electron-builder | 开发热重载；打包 NSIS 安装器 |
| 屏幕捕获 | FFmpeg `ddagrab` 滤镜 | DXGI Desktop Duplication，D3D11 GPU 帧直出，零拷贝 |
| 编码（录制/导出） | FFmpeg 硬编 NVENC → QSV → AMF → libx264 | 启动时能力探测，逐级回退 |
| 音频 | Chromium `getDisplayMedia`（系统声）+ `getUserMedia`（麦克风） | WebAudio 混音，**零驱动依赖** |
| 输入事件 | uIOhook（独立 Node 子进程） | 全局鼠标/键盘钩子 → `events.jsonl` |
| 视频处理/导出 | FFmpeg 子进程 + `filter_complex` 滤镜图 | 生成器为纯函数 + golden 快照测试 |
| 日志 | electron-log → `logs/` | 统一文件输出，主/渲染/子进程共用 |

**选型理由**：视频重活全部交给 FFmpeg 与 Chromium 两个成熟内核，自研代码只有「编排 + 领域类型 + UI」；开发效率在三个候选方案中最高；纯 TypeScript 栈完全符合「TS 优先、严禁 commonjs」的开发规则。对标产品 Cap 同为「TS 前端 + 系统捕获 + FFmpeg」思路（其宿主为 Tauri）。

---

## 2. 与 C# 方案的关键差异（换方案的收益与代价）

| 维度 | C# WinUI 3（已存档） | Electron（本方案） |
|------|---------------------|-------------------|
| 捕获 | WGC 原生（窗口/区域/整屏全覆盖） | ddagrab 整屏/区域；**窗口捕获延至 V2**（见 §8 风险） |
| 时间轴编辑器 | Win2D 全自绘（最大工作量） | React + Canvas 自绘，热重载、生态丰富（显著减负） |
| 安装包体积 | ~60 MB | ~150 MB |
| 运行内存 | 中 | 高（Chromium 常驻） |
| 开发速度 | 中 | **最快** |
| 跨平台潜力 | 需重写 | macOS / Linux 直接复用 |

**不变的部分**（换宿主不动领域层）：录制产物协议、时间轴模型、导出 RenderPlan 管线、阶段划分。

---

## 3. 产品能力边界

| 能力 | 说明 | 架构影响 |
|------|------|----------|
| 屏幕捕获 | 整屏 / 区域（MVP），单窗口（V2），30 或 60 fps | ddagrab `output_idx` + `crop` 滤镜 |
| 音频 | 麦克风 + 系统声音可分别开关、混音 | Chromium 双路采集 → WebAudio 混音 |
| 输入记录 | 鼠标点击高亮、键盘按键显示 | 事件流与视频流分离录制（关键决策） |
| 时间轴剪辑 | 裁剪、分割、删除片段、变速 | 结构化时间轴模型 |
| 叠加编辑 | 文字、标注、缩放动画、摄像头画中画 | 导出期 FFmpeg 滤镜图合成 |
| 导出 | MP4 (H.264/H.265)、WebM、GIF，硬编优先 | FFmpeg 编码器探测与回退 |

---

## 4. 总体分层架构

```
┌────────────────────────────────────────────────────────┐
│  UI 层  React 19 + Tailwind v4                          │
│  录制悬浮条 · 工程库 · 时间轴编辑器(Canvas) · 导出面板  │
├────────────────────────────────────────────────────────┤
│  应用服务层（TS，主进程）                                │
│  工程管理 · 录制会话状态机 · 导出任务队列 · IPC 网关    │
├────────────────────────────────────────────────────────┤
│  领域核心层（纯 TS，禁止 import electron，可单测）       │
│  ├─ 录制会话模型（屏幕/音频/事件三路对齐）              │
│  ├─ 时间轴模型 → 帧调度 → RenderPlan（纯函数）          │
│  └─ RenderPlan → FFmpeg 参数/滤镜图（纯函数）           │
├────────────────────────────────────────────────────────┤
│  平台层                                                 │
│  FFmpeg 子进程封装 · Chromium 采集(WebAudio)            │
│  uIOhook 子进程 · electron-log                          │
└────────────────────────────────────────────────────────┘
```

核心思想：**领域核心层是纯 TypeScript（严格类型 + 纯函数），不出现任何 `electron` 导入**；FFmpeg 命令永远只由平台层封装构造，上层只见 `RenderPlan` 等领域类型。架构坏味道中的僵化、循环依赖由此防线挡住。

---

## 5. 关键设计决策

### 5.1 录制产物 = 媒体文件 + 工程文件（录制与编辑解耦）

```
recordings/<session-id>/
├─ screen.mp4        # 屏幕：近无损画质（等效 CRF≈18）、gop=30~60 密集关键帧
├─ camera.webm       # 摄像头（可选，独立文件，后期画中画）
├─ audio-mix.wav     # 麦克风+系统声混音（48kHz 立体声 PCM，可选）
├─ events.jsonl      # 鼠标点击/移动/滚轮/键盘事件流（单调时钟时间戳）
└─ session.json      # 元数据：分辨率、帧率、显示器信息、三路起始偏移
```

**为什么事件流单独存**：点击高亮、按键显示是「叠加特效」，录制时烧进画面就永久不可改；存为事件流后样式（颜色、大小、开关）随时在编辑期调整——与 Screen Studio / Cap 一致。

**为什么密集关键帧**：剪辑 seek 精度取决于关键帧密度；录制期画质给足，导出期二次编码才有余量。

### 5.2 录制管线（三路并行 + 单调时钟对齐）

```
视频：FFmpeg 子进程
  ffmpeg -f lavfi -i ddagrab=output_idx=N:framerate=60
         [-vf crop_cuda/scale_cuda]  →  h264_nvenc（探测失败 → h264_qsv → h264_amf → libx264）
  → fragmented MP4（崩溃可恢复，秒级落盘）

音频：渲染进程 WebAudio
  getDisplayMedia({ video:false, audio:{ system 系统声 } })   ← setDisplayMediaRequestHandler 自动授权，不弹系统选择框
  getUserMedia({ audio:{ 麦克风 } })
  → AudioWorklet 混音（重采样 48kHz/立体声，可分别调音量）→ WAV 落盘

事件：event-hook 子进程（fork）
  uIOhook 全局鼠标/键盘 → 逐行写 events.jsonl（独立线程，顺序追加）
```

同步机制：三路均以 `performance.timeOrigin + performance.now()`（单调时钟）打点，`session.json` 记录各流起始偏移，导出时校正。

### 5.3 编辑模型：时间轴即数据（纯函数渲染）

工程文件（`project.json`）完整描述编辑状态，渲染器为纯函数：`Project → RenderPlan`（合成指令序列）。无隐藏状态；撤销/重做 = 不可变快照栈。所有领域类型用 discriminated union 严格定义，禁用裸 `any`（遵循开发规则）。

```jsonc
{
  "media": [{ "id": "m1", "type": "screen", "path": "screen.mp4", "duration": 183.4 }],
  "timeline": {
    "clips": [{ "id": "c1", "mediaId": "m1", "timelineStart": 0, "inPoint": 2.0, "outPoint": 60.5, "speed": 1.0 }],
    "overlays": [
      { "type": "cursorHighlight", "enabled": true, "style": { "color": "#FFD400", "radius": 18 } },
      { "type": "zoom", "timeRange": [12.0, 18.0], "region": [0.35, 0.2, 0.5, 0.5], "easing": "easeInOut" },
      { "type": "text", "timeRange": [3.0, 8.0], "content": "第一步：打开设置", "position": [0.1, 0.85] }
    ]
  }
}
```

### 5.4 导出管线（离线、可排队、进度可汇报）

```
project.json
  → 帧调度器（每个输出帧号 → 源帧号 + 生效叠加列表）        [纯函数]
  → RenderPlan → FFmpeg filter_complex 滤镜图与命令行        [纯函数]
  → FFmpeg 子进程执行（NVENC → QSV → AMF → libx264 逐级回退）
  → MP4 / WebM / GIF
```

- 滤镜图生成器输入输出均为领域类型，用快照测试（golden file）保证不回归。
- 导出跑在 `utilityProcess` 队列 worker 中，UI 显示进度，支持多任务排队与取消。

### 5.5 进程模型

```
Electron 主进程（Node ESM）
├─ renderer：React UI（承载音频采集与混音，崩溃不影响录制子进程）
├─ FFmpeg 子进程（录制会话 / 导出会话，崩溃隔离）
├─ event-hook 子进程（uIOhook 全局钩子）
└─ utilityProcess：导出任务队列 worker（可多实例）
```

进程间通信：主进程 IPC 网关 + `MessagePort`；消息类型统一定义 discriminated union，收发两端共享 `shared/` 类型。

### 5.6 捕获引擎可插拔

`CaptureSource` 抽象统一「整屏 / 区域 / 窗口」三种来源：MVP 后端为 FFmpeg ddagrab；V2 窗口捕获追加后端（见 §8），上层编排代码不变。

---

## 6. 目录结构规划（遵守：TS 单文件 ≤300 行 / 每层文件夹 ≤8 项）

```
DesktopRecordingTool/
├─ scripts/                     # 启停脚本（.sh，封装 npm/electron CLI）
├─ logs/                        # electron-log 文件输出
├─ docs/                        # 正式文档
├─ discuss/                     # 方案评审文档
├─ resources/ffmpeg/            # ffmpeg.exe（打包或首次运行下载，固定 7.x full build）
├─ src/
│  ├─ main/                     # 主进程入口：窗口、生命周期、IPC 路由
│  ├─ core/                     # 领域核心（纯 TS，无 electron 依赖）
│  │  ├─ recording/             # 录制会话模型、事件流模型
│  │  ├─ editing/               # 时间轴模型、校验、撤销栈
│  │  └─ exporting/             # RenderPlan、FFmpeg 参数纯函数
│  ├─ recorder/                 # 平台层：FFmpeg 录制会话、能力探测
│  ├─ hooks/                    # event-hook 子进程入口（uIOhook）
│  ├─ exporter/                 # 平台层：导出队列 worker、FFmpeg 进程封装
│  ├─ shared/                   # 跨进程类型、IPC 消息定义、纯工具
│  └─ renderer/
│     ├─ views/                 # 页面级组件
│     └─ components/            # 时间轴编辑器、悬浮条、设置面板
└─ tests/                       # 领域层单测 + 滤镜图 golden 快照
```

---

## 7. 风险与对策

| 风险 | 对策 |
|------|------|
| **窗口级捕获 MVP 缺失**（ddagrab 仅整屏） | V2 两条路径：a) Chromium desktopCapturer + MediaRecorder（H.264 硬编 webm，快速可用）；b) N-API 原生模块封装 WGC（质量最优）。`CaptureSource` 抽象保证可插拔 |
| 系统音频采集失败（旧系统/策略） | 检测 `getDisplayMedia` 音频轨道为空时降级为仅麦克风，录制不中断 |
| 低级钩子被安全策略拦截（管理员窗口 UIPI） | 钩子失败降级为无光标特效录制，不阻塞主流程 |
| ddagrab 需要 FFmpeg ≥ 6.0 且带 D3D11VA | 固定内置 7.x full build（gyan.dev），随应用分发，不依赖用户环境 |
| 安装包体积 / 内存占用 | electron-builder 按架构分发；时间轴预览用缩略图缓存，避免全量解码常驻内存 |
| FFmpeg 滤镜图复杂度失控 | 生成器纯函数化 + golden 快照测试；超限时拆多段两级转码 |
| 音视频不同步 | 单调时钟统一打点 + session.json 偏移校正，导出期 `-async`/`aresample` 微调 |

---

## 8. 开发阶段划分

| 阶段 | 交付物 | 验收标准 |
|------|--------|----------|
| M1（约 1–2 周） | 项目骨架（electron-vite + strict TS + ESM + electron-log + scripts/）+ 录制 MVP：整屏/区域 + 双路音频 + 硬编落盘 | 60fps 录制 10 分钟，CPU < 15%，崩溃可恢复 |
| M2 | 输入事件流 + 内置预览播放器 + 简单裁剪导出 | 录完即可裁剪并导出 MP4 |
| M3 | 时间轴编辑器：分割/删除/变速 + 文字叠加 | 工程文件可保存/重开，导出结果与预览一致 |
| M4 | 光标特效 + 缩放动画 + GIF/WebM 导出 | 对标 Cap 本地编辑能力 |
| M5 | 窗口捕获（Chromium 路径起步，必要时 N-API WGC）+ 摄像头画中画 | 完整产品形态 |
