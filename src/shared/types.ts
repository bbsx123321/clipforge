/**
 * 领域共享类型：主进程、渲染进程、平台层共同引用。
 * 全部对象不可变（readonly），跨进程传递时不允许被篡改。
 */

/** 显示器信息（录制目标选择） */
export type DisplayInfo = {
  readonly id: string
  /** FFmpeg ddagrab 的显示器序号（output_idx），按显示器 X 坐标排序 */
  readonly outputIndex: number
  readonly label: string
  readonly width: number
  readonly height: number
  readonly isPrimary: boolean
}

/** 区域矩形（像素，相对显示器左上角） */
export type RegionRect = {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** 录制模式：整屏 / 手动区域 / 软件窗口捕获 */
export type RecordMode =
  | { readonly kind: 'fullscreen'; readonly outputIndex: number }
  | { readonly kind: 'region'; readonly outputIndex: number; readonly region: RegionRect }
  /** 窗口捕获：窗口在所属显示器内的物理矩形（录制管线与区域一致，尺寸与窗口 1:1） */
  | { readonly kind: 'window'; readonly outputIndex: number; readonly region: RegionRect; readonly title: string }

/** 窗口探查结果（选择器 hover 高亮用，rect 为窗口在所属显示器内的物理矩形） */
export type WindowProbe = {
  readonly rect: RegionRect
  readonly title: string
  /** 窗口所在显示器（按 X 排序的序号，与 ddagrab output_idx 一致） */
  readonly outputIndex: number
}

/** 支持的帧率档位 */
export type Framerate = 30 | 60

/** 一次录制的完整设置 */
export type RecordSettings = {
  readonly mode: RecordMode
  readonly framerate: Framerate
  readonly captureSystemAudio: boolean
  readonly captureMicrophone: boolean
}

/** 录制阶段（状态机取值） */
export type RecordPhase = 'idle' | 'recording' | 'paused'

/** 录制分段（暂停后恢复会产生新分段文件） */
export type RecordingSegment = {
  readonly file: string
  /** 相对录制会话起点的毫秒偏移 */
  readonly startOffsetMs: number
}

/** 音频轨道描述（清单内嵌） */
export type ManifestAudio = {
  readonly file: string
  readonly sampleRate: number
  readonly channels: number
  readonly startOffsetMs: number
}

/** 录制清单：一次录制的最终产物描述（session.json 内容） */
export type RecordManifest = {
  readonly version: 1
  readonly sessionId: string
  readonly startedAtWallMs: number
  readonly stoppedAtWallMs: number
  readonly settings: RecordSettings
  readonly segments: readonly RecordingSegment[]
  readonly audio: ManifestAudio | undefined
  /** 产物异常警告（如视频文件过小），正常为空数组 */
  readonly warnings: readonly string[]
}

export type StartRecordingResult =
  | { readonly ok: true; readonly sessionId: string }
  | { readonly ok: false; readonly error: string }

export type StopRecordingResult =
  | { readonly ok: true; readonly outputDir: string; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly error: string }

/** 渲染进程转发到主进程日志文件的一条日志 */
export type LogMessage = {
  readonly level: 'info' | 'warn' | 'error'
  readonly message: string
}

/** 录制输出目录信息（当前生效值） */
export type OutputDirInfo = {
  /** 当前生效的输出根目录（绝对路径） */
  readonly dir: string
  /** 是否为默认目录（用户未自定义） */
  readonly isDefault: boolean
}

/** 全局快捷键配置（Electron accelerator 格式，如 'F10'、'Control+Shift+R'） */
export type HotkeyConfig = {
  /** 开始/停止录制 */
  readonly record: string
  /** 暂停/继续 */
  readonly pause: string
}

/** 素材库中的单条录制记录（供最近录制列表展示与双击播放） */
export type RecordingSummary = {
  /** 唯一标识（sessionId + 文件名） */
  readonly id: string
  /** 显示名（如 screen-001.mp4） */
  readonly file: string
  /** 视频绝对路径 */
  readonly filePath: string
  /** 所在产物目录绝对路径 */
  readonly dirPath: string
  /** 视频时长（秒，ffprobe 探测；失败时为 0） */
  readonly durationSec: number
  /** 录制完成时间（墙钟毫秒） */
  readonly recordedAtMs: number
  /** 是否包含音轨 */
  readonly hasAudio: boolean
}

/** 编辑时间轴上的一个片段（源文件内的时间区间 + 倍速） */
export type EditSegment = {
  readonly startSec: number
  readonly endSec: number
  /** 播放/导出倍速（1 = 原速） */
  readonly speed: number
}

/** 一次剪辑工程：源文件 + 有序片段列表（按序拼接即为导出结果） */
export type EditProject = {
  readonly sourceFilePath: string
  readonly durationSec: number
  readonly hasAudio: boolean
  readonly segments: readonly EditSegment[]
  /** 字幕数据（开启任一字幕导出方式时携带） */
  readonly subtitles: EditProjectSubtitles | undefined
}

/** 字幕条目（时间均为源视频内秒数） */
export type SubtitleCue = {
  readonly id: string
  readonly startSec: number
  readonly endSec: number
  readonly text: string
}

/** 字幕样式（编辑器预览与烧录渲染共用同一组参数，所见即所得） */
export type SubtitleStyle = {
  /** 字号（视频高度的百分比，3~8） */
  readonly fontSizePct: number
  /** 显示位置：底部 / 顶部 */
  readonly position: 'bottom' | 'top'
  /** 距底/顶边距（视频高度的百分比，2~20） */
  readonly marginPct: number
  /** 文字不透明度（0.5~1） */
  readonly textOpacity: number
  /** 黑底开关 */
  readonly boxEnabled: boolean
  /** 黑底不透明度（0.3~1） */
  readonly boxOpacity: number
}

/** 导出时的字幕选项（三种方式可任意组合） */
export type ExportSubtitleOptions = {
  /** 烧录进画面（libass 滤镜） */
  readonly burn: boolean
  /** 导出同名独立 .srt 文件 */
  readonly srtFile: boolean
  /** MP4 内嵌 mov_text 软字幕轨 */
  readonly softTrack: boolean
}

/** 导出载荷中的字幕数据 */
export type EditProjectSubtitles = {
  readonly cues: readonly SubtitleCue[]
  readonly style: SubtitleStyle
  readonly options: ExportSubtitleOptions
}

/** 识别状态（工程文件内嵌，编辑器据此渲染状态条） */
export type AsrStatus = 'none' | 'pending' | 'ready' | 'failed'

/** 识别进度广播（主进程 → 渲染端，编辑器按 dirPath+videoFile 匹配当前工程） */
export type SubtitleProgressEvent = {
  readonly dirPath: string
  readonly videoFile: string
  readonly progress: number
}

/** 字幕工程文件（每视频段一份，session 目录下与视频同名 .edit.json） */
export type EditProjectFile = {
  readonly version: 1
  /** 所属视频分段文件名（如 screen-001.mp4） */
  readonly sourceFile: string
  readonly segments: readonly EditSegment[]
  readonly cues: readonly SubtitleCue[]
  readonly style: SubtitleStyle
  /** 混音轨波形峰值包络（每 0.1s 一点，0~1 归一化；空数组 = 未生成） */
  readonly waveform: readonly number[]
  readonly asr: {
    readonly status: AsrStatus
    readonly progress: number
    readonly error: string | undefined
  }
}

export type ExportResult =
  | { readonly ok: true; readonly outputPath: string }
  | { readonly ok: false; readonly error: string }
