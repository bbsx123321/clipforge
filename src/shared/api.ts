import type { DisplayInfo, EditProject, EditProjectFile, ExportResult, HotkeyConfig, LogMessage, OutputDirInfo, RecordPhase, RecordSettings, RecordingSummary, RegionRect, StartRecordingResult, StopRecordingResult, SubtitleProgressEvent, WindowProbe } from './types'
import type { Lang } from './strings'

/**
 * 渲染进程可调用的窗口 API 契约。
 * 由 preload 通过 contextBridge 注入为 window.api，渲染进程只依赖此类型。
 */
export type RecordingApi = {
  readonly listDisplays: () => Promise<readonly DisplayInfo[]>
  readonly startRecording: (settings: RecordSettings) => Promise<StartRecordingResult>
  readonly pauseRecording: () => Promise<void>
  readonly resumeRecording: () => Promise<void>
  readonly stopRecording: () => Promise<StopRecordingResult>
  /** 上报一段 Int16 PCM 音频数据（48kHz 立体声） */
  readonly sendAudioChunk: (pcmBuffer: ArrayBuffer) => void
  /** 上报一段麦克风独立 Int16 PCM（48kHz 立体声，字幕识别专用，混音流照常上报） */
  readonly sendMicAudioChunk: (pcmBuffer: ArrayBuffer) => void
  /** 渲染进程日志转发到主进程日志文件 */
  readonly log: (message: LogMessage) => void
  /** 打开全屏区域选区覆盖层 */
  readonly openRegionPicker: () => Promise<void>
  /** overlay 窗口确认选区（物理像素坐标） */
  readonly sendRegionSelected: (region: RegionRect) => void
  /** overlay 窗口取消选区 */
  readonly cancelRegionPicker: () => void
  /** 订阅区域选区结果，返回取消订阅函数 */
  readonly onRegionSelected: (handler: (region: RegionRect) => void) => () => void
  /** 订阅录制阶段广播，返回取消订阅函数 */
  readonly onRecordPhase: (handler: (phase: RecordPhase) => void) => () => void
  /** 订阅录制错误广播（编码进程意外退出等），返回取消订阅函数 */
  readonly onRecordError: (handler: (message: string) => void) => () => void
  /** 展开/收起控制条窗口（设置面板开合） */
  readonly expandControlWindow: (expanded: boolean) => Promise<void>
  /** 隐藏控制条到托盘 */
  readonly minimizeToTray: () => Promise<void>
  /** 退出应用（录制中先自动停止并保存） */
  readonly closeApplication: () => Promise<void>
  /** 进入待录状态并开始 3 秒倒计时（倒计时结束自动开录） */
  readonly armRecording: (settings: RecordSettings) => Promise<StartRecordingResult>
  /** 取消倒计时 */
  readonly cancelArm: () => Promise<void>
  /** 上报最新录制设置（供 F10 快捷键入口直接开录） */
  readonly syncArmSettings: (settings: RecordSettings) => void
  /** 订阅倒计时数字（倒计时覆盖层用），返回取消订阅函数 */
  readonly onCountdown: (handler: (seconds: number) => void) => () => void
  /** 查询当前录制输出目录 */
  readonly getOutputDir: () => Promise<OutputDirInfo>
  /** 弹出目录选择对话框；用户取消时返回 undefined */
  readonly chooseOutputDir: () => Promise<OutputDirInfo | undefined>
  /** 恢复默认输出目录 */
  readonly resetOutputDir: () => Promise<OutputDirInfo>
  /** 调整控制条窗口尺寸（视图切换） */
  readonly resizeControlWindow: (width: number, height: number) => Promise<void>
  /** 素材库：最近录制列表 */
  readonly listRecordings: () => Promise<readonly RecordingSummary[]>
  /** 批量删除录制源文件（整个 session 目录）；返回删除失败的目录 */
  readonly deleteRecordingFiles: (dirPaths: readonly string[]) => Promise<readonly string[]>
  /** 批量仅移除记录（保留视频文件）；返回失败的目录 */
  readonly hideRecordingRecords: (dirPaths: readonly string[]) => Promise<readonly string[]>
  /** 导出剪辑工程（弹出保存对话框，主进程执行 FFmpeg） */
  readonly exportEdited: (project: EditProject) => Promise<ExportResult>
  /** 手动设置窗口位置与尺寸（四角拖拽缩放用） */
  readonly setWindowBounds: (bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }) => Promise<void>
  /** 查询当前生效的快捷键 */
  readonly getHotkeys: () => Promise<HotkeyConfig>
  /** 更新快捷键（注册成功并持久化返回 true；被占用回滚返回 false） */
  readonly updateHotkeys: (config: HotkeyConfig) => Promise<boolean>
  /** 关闭录制区域红色描边（清除区域/切换显示器时调用） */
  readonly closeRegionFrame: () => void
  /** 打开窗口捕获选择覆盖层 */
  readonly openWindowPicker: () => Promise<void>
  /** 探查光标下的窗口（矩形为物理像素；无有效窗口返回 undefined） */
  readonly probeWindowAtCursor: () => Promise<WindowProbe | undefined>
  /** 确认捕获当前光标下的窗口 */
  readonly pickWindowAtCursor: () => Promise<WindowProbe | undefined>
  /** 取消窗口选择 */
  readonly cancelWindowPicker: () => void
  /** 订阅窗口选定结果（写入录制模式），返回取消订阅函数 */
  readonly onWindowSelected: (handler: (probe: WindowProbe) => void) => () => void
  /** 查询界面语言 */
  readonly getLanguage: () => Promise<Lang>
  /** 切换界面语言（持久化并广播全部窗口） */
  readonly setLanguage: (lang: Lang) => Promise<Lang>
  /** 订阅界面语言变化，返回取消订阅函数 */
  readonly onLanguageChanged: (handler: (lang: Lang) => void) => () => void
  /** 手动触发/重试字幕识别（后台长任务；返回是否已受理，进度经 onSubtitleProgress 上报） */
  readonly startTranscription: (dirPath: string, videoFile: string) => Promise<boolean>
  /** 订阅字幕识别进度，返回取消订阅函数 */
  readonly onSubtitleProgress: (handler: (event: SubtitleProgressEvent) => void) => () => void
  /** 读取字幕工程文件（hasAudio 时主进程按需生成波形峰值） */
  readonly loadEditProject: (dirPath: string, videoFile: string, durationSec: number, hasAudio: boolean) => Promise<EditProjectFile>
  /** 保存字幕工程文件 */
  readonly saveEditProject: (dirPath: string, file: EditProjectFile) => Promise<void>
}
