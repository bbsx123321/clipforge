/**
 * 界面文案双语字典与翻译函数（主进程与渲染进程共用，纯函数无副作用）。
 * 新增界面文案时在 STRINGS 登记 key，中文英文各一句；
 * 占位符用 {name} 形式，调用时通过 params 插值。
 */

/** 界面语言 */
export type Lang = 'zh' | 'en'

/** 双语文案条目 */
type Entry = {
  readonly zh: string
  readonly en: string
}

/** 全部界面文案（key 按界面区域分组命名） */
export const STRINGS = {
  // ── 通用 ──
  'app.name': { zh: '剪录坊', en: 'ClipForge' },
  'common.cancel': { zh: '取消', en: 'Cancel' },
  'common.start': { zh: '开始', en: 'Start' },
  'common.stop': { zh: '停止', en: 'Stop' },
  'common.pause': { zh: '暂停', en: 'Pause' },
  'common.resume': { zh: '继续', en: 'Resume' },
  'common.loading': { zh: '读取中…', en: 'Loading…' },
  'common.change': { zh: '更改', en: 'Change' },
  'common.resetDefault': { zh: '恢复默认', en: 'Reset' },

  // ── 录制模式展示 ──
  'mode.fullscreen': { zh: '全屏 · 显示器 {n}', en: 'Fullscreen · Display {n}' },
  'mode.window': { zh: '窗口 {w}×{h}', en: 'Window {w}×{h}' },
  'mode.region': { zh: '区域 {w}×{h}', en: 'Region {w}×{h}' },

  // ── 悬浮控制条 ──
  'bar.startingSoon': { zh: '即将开始…', en: 'Starting…' },
  'bar.settingsTitle': { zh: '录制设置', en: 'Recording settings' },
  'bar.minimizeTitle': { zh: '最小化到托盘', en: 'Minimize to tray' },
  'bar.quitTitle': { zh: '退出应用', en: 'Quit' },
  'bar.quitRecordingTitle': { zh: '停止录制并退出', en: 'Stop & quit' },

  // ── 悬浮条提示 ──
  'notice.hotkeySame': { zh: '两个快捷键不能相同', en: 'The two shortcuts must differ' },
  'notice.hotkeyRegisterFail': {
    zh: '快捷键注册失败（可能被其他软件占用），已保留原快捷键',
    en: 'Shortcut registration failed (possibly taken by another app); previous shortcuts kept'
  },
  'notice.outputDirFail': { zh: '输出目录设置失败：{msg}', en: 'Failed to set output folder: {msg}' },
  'notice.outputDirResetFail': { zh: '输出目录重置失败：{msg}', en: 'Failed to reset output folder: {msg}' },
  'notice.pauseFail': { zh: '暂停失败：{msg}', en: 'Failed to pause: {msg}' },
  'notice.resumeFail': { zh: '恢复失败：{msg}', en: 'Failed to resume: {msg}' },
  'notice.saved': { zh: '已保存：{path}', en: 'Saved: {path}' },
  'notice.savedWithWarnings': { zh: '{warnings}（产物：{path}）', en: '{warnings} (output: {path})' },

  // ── 设置面板 ──
  'settings.video': { zh: '画面', en: 'Video' },
  'settings.audio': { zh: '声音', en: 'Audio' },
  'settings.storage': { zh: '存储', en: 'Storage' },
  'settings.hotkeys': { zh: '全局快捷键', en: 'Global shortcuts' },
  'settings.language': { zh: '语言', en: 'Language' },
  'settings.systemSound': { zh: '系统声音', en: 'System audio' },
  'settings.microphone': { zh: '麦克风', en: 'Microphone' },
  'settings.pickRegion': { zh: '框选录制区域', en: 'Select region' },
  'settings.repickRegion': { zh: '重新框选区域', en: 'Reselect region' },
  'settings.pickWindow': { zh: '捕获软件窗口', en: 'Capture app window' },
  'settings.repickWindow': { zh: '重新选窗口', en: 'Reselect window' },
  'settings.windowHint': {
    zh: '窗口：{title}（录制期间请保持窗口位置不动）',
    en: 'Window: {title} (keep it in place while recording)'
  },
  'settings.hotkeyRecord': { zh: '开始 / 停止', en: 'Start / Stop' },
  'settings.hotkeyPause': { zh: '暂停 / 继续', en: 'Pause / Resume' },
  'settings.hotkeyHint': {
    zh: '点击按键后按下新组合（支持 Ctrl/Alt/Shift 组合），Esc 取消',
    en: 'Click a key, then press a new combo (Ctrl/Alt/Shift supported). Esc to cancel'
  },
  'settings.hotkeyChangeTitle': { zh: '点击修改快捷键', en: 'Click to change shortcut' },
  'settings.hotkeyCapturing': { zh: '按下新按键…', en: 'Press new keys…' },
  'settings.hotkeyCaptureHint': { zh: '按下新的组合键（Esc 取消）', en: 'Press a new key combo (Esc to cancel)' },

  // ── 显示器 ──
  'display.label': { zh: '显示器 {n}', en: 'Display {n}' },
  'display.primarySuffix': { zh: '（主）', en: ' (main)' },

  // ── 最近录制列表 ──
  'list.title': { zh: '最近录制', en: 'Recent' },
  'list.hint': { zh: '双击播放与剪辑', en: 'Double-click to play & edit' },
  'list.manage': { zh: '管理', en: 'Manage' },
  'list.exitManage': { zh: '退出管理', en: 'Done' },
  'list.selectAll': { zh: '全选', en: 'Select all' },
  'list.deselectAll': { zh: '取消全选', en: 'Deselect all' },
  'list.selectedCount': { zh: '已选 {n} 项', en: '{n} selected' },
  'list.deleteFiles': { zh: '删除源文件', en: 'Delete files' },
  'list.deleteFilesTitle': {
    zh: '删除选中记录的源文件（整个产物目录，含视频）',
    en: 'Delete source files of selected items (entire output folder, incl. video)'
  },
  'list.hideRecords': { zh: '仅移除记录', en: 'Remove records' },
  'list.hideRecordsTitle': {
    zh: '仅从列表移除，视频文件保留在磁盘',
    en: 'Remove from the list only; video files stay on disk'
  },
  'list.selectFirst': { zh: '请先勾选要操作的记录', en: 'Select items first' },
  'list.partialFail': {
    zh: '{failed}/{total} 项操作失败（文件被占用）——请确认视频未在播放器中打开后重试；其余项已生效',
    en: '{failed}/{total} items failed (files in use) — make sure the videos are not open in a player and retry; the rest succeeded'
  },
  'list.actionFail': { zh: '操作失败：{msg}', en: 'Action failed: {msg}' },

  // ── 编辑器 ──
  'editor.source': { zh: '源', en: 'Source' },
  'editor.exported': { zh: '成片', en: 'Output' },
  'editor.trimModeHint': { zh: '裁剪模式：点击轨道选起止点', en: 'Trim mode: click the track to set in/out points' },
  'editor.trimStartTip': {
    zh: '点击轨道放置「开始」，再点一次放置「结束」；拖动标签可微调',
    en: 'Click the track to place Start, click again for End; drag the tags to fine-tune'
  },
  'editor.play': { zh: '播放', en: 'Play' },
  'editor.back': { zh: '返回控制条', en: 'Back to controls' },
  'editor.trim': { zh: '裁剪', en: 'Trim' },
  'editor.speedSelection': { zh: '加速选区', en: 'Speed up' },
  'editor.speedTitle': { zh: '作用于选区，多次点击逐级加速', en: 'Applies to the selection; click repeatedly for higher speed' },
  'editor.deleteSelection': { zh: '删除选区', en: 'Delete selection' },
  'editor.undo': { zh: '撤销', en: 'Undo' },
  'editor.exportMp4': { zh: '导出 MP4', en: 'Export MP4' },
  'editor.exporting': { zh: '导出中…', en: 'Exporting…' },
  'editor.needSelectionSpeed': {
    zh: '请先用「裁剪」在轨道上点选起止两点，再加速',
    en: 'Set start/end points with Trim first, then speed up'
  },
  'editor.needSelectionDelete': {
    zh: '请先用「裁剪」在轨道上点选起止两点，再删除',
    en: 'Set start/end points with Trim first, then delete'
  },
  'editor.speedApplied': { zh: '选区已加速为 {n}x', en: 'Selection speed set to {n}x' },
  'editor.deleted': { zh: '选区已删除', en: 'Selection deleted' },
  'editor.nothingToUndo': { zh: '没有可撤销的操作', en: 'Nothing to undo' },
  'editor.undone': { zh: '已撤销', en: 'Undone' },
  'editor.allDeleted': { zh: '所有片段都已删除，无可导出内容', en: 'All segments deleted — nothing to export' },
  'editor.exportedOk': { zh: '已导出：{path}', en: 'Exported: {path}' },
  'editor.exportFail': { zh: '导出失败：{msg}', en: 'Export failed: {msg}' },
  'editor.exportCancelled': { zh: '已取消导出', en: 'Export cancelled' },
  'editor.playFail': { zh: '播放失败：{msg}', en: 'Playback failed: {msg}' },
  'editor.loadFail': {
    zh: '视频加载失败（协议或文件不可读，详情见日志）',
    en: 'Failed to load video (unreadable file — see log)'
  },

  // ── 时间轴标记 ──
  'timeline.start': { zh: '开始', en: 'Start' },
  'timeline.end': { zh: '结束', en: 'End' },

  // ── 字幕（识别 / 编辑 / 样式 / 导出） ──
  'subtitle.audioTrack': { zh: '声音', en: 'Audio' },
  'subtitle.subtitleTrack': { zh: '字幕', en: 'Subtitles' },
  'subtitle.none': { zh: '本次录制未开启麦克风，无字幕可识别', en: 'Microphone was off — no subtitles to transcribe' },
  'subtitle.pending': { zh: '字幕识别中 {n}%…', en: 'Transcribing {n}%…' },
  'subtitle.failed': { zh: '识别失败：{msg}', en: 'Transcription failed: {msg}' },
  'subtitle.retry': { zh: '重试识别', en: 'Retry' },
  'subtitle.transcribingQueued': { zh: '已开始识别', en: 'Transcription started' },
  'subtitle.add': { zh: '加字幕', en: 'Add cue' },
  'subtitle.clearAll': { zh: '清空字幕', en: 'Clear all' },
  'subtitle.cleared': { zh: '已清空全部字幕', en: 'All subtitles cleared' },
  'subtitle.addedAt': { zh: '已在播放头处添加字幕', en: 'Cue added at playhead' },
  'subtitle.dragHint': { zh: '拖动字幕块调时间，双击空白新建', en: 'Drag cues to adjust timing; double-click to add' },
  'subtitle.cueText': { zh: '文本', en: 'Text' },
  'subtitle.cueStart': { zh: '开始(秒)', en: 'Start (s)' },
  'subtitle.cueEnd': { zh: '结束(秒)', en: 'End (s)' },
  'subtitle.deleteCue': { zh: '删除此条', en: 'Delete cue' },
  'subtitle.prevCue': { zh: '上一条', en: 'Prev' },
  'subtitle.nextCue': { zh: '下一条', en: 'Next' },
  'subtitle.style': { zh: '字幕样式', en: 'Subtitle style' },
  'subtitle.styleSize': { zh: '字号', en: 'Font size' },
  'subtitle.stylePosition': { zh: '位置', en: 'Position' },
  'subtitle.styleBottom': { zh: '底部', en: 'Bottom' },
  'subtitle.styleTop': { zh: '顶部', en: 'Top' },
  'subtitle.styleMargin': { zh: '距边缘', en: 'Margin' },
  'subtitle.styleTextOpacity': { zh: '文字不透明度', en: 'Text opacity' },
  'subtitle.styleBox': { zh: '黑底', en: 'Black box' },
  'subtitle.styleBoxOpacity': { zh: '底色不透明度', en: 'Box opacity' },
  'subtitle.exportBurn': { zh: '烧录进画面', en: 'Burn into video' },
  'subtitle.exportSrt': { zh: '导出 .srt 文件', en: 'Export .srt' },
  'subtitle.exportSoft': { zh: 'MP4 软字幕轨', en: 'MP4 soft track' },
  'subtitle.exportOptions': { zh: '字幕导出', en: 'Subtitle export' },

  // ── 全屏覆盖层 ──
  'overlay.regionHint': {
    zh: '拖拽框选录制区域（至少 8×8 像素），按 Esc 取消',
    en: 'Drag to select the recording region (min 8×8 px). Esc to cancel'
  },
  'overlay.windowHint': {
    zh: '移动鼠标选择软件窗口，点击开始捕获，按 Esc 取消',
    en: 'Move the mouse onto an app window and click to capture. Esc to cancel'
  },
  'overlay.windowNone': {
    zh: '此处未检测到可捕获窗口（桌面/任务栏不可选）——移到软件窗口上试试',
    en: 'No capturable window here (desktop/taskbar excluded) — move onto an app window'
  },
  'countdown.title': { zh: '即将开始录制', en: 'Recording starts soon' },
  'countdown.hint': { zh: '按「开始/停止」快捷键可中止', en: 'Press the start/stop shortcut to abort' },
  'regionFrame.label': { zh: '录制区 {w}×{h}', en: 'REC {w}×{h}' },

  // ── 语言选项 ──
  'lang.zh': { zh: '中文', en: '中文' },
  'lang.en': { zh: 'English', en: 'English' },

  // ── 原生对话框（主进程） ──
  'dialog.chooseOutputDir': { zh: '选择录制输出目录', en: 'Choose recording output folder' },
  'dialog.chooseOutputDirButton': { zh: '选择此目录', en: 'Select this folder' },

  // ── 托盘（主进程） ──
  'tray.tooltipIdle': { zh: '剪录坊（{key} 开始）', en: 'ClipForge ({key} to start)' },
  'tray.tooltipRecording': { zh: '剪录坊 - 录制中（{key} 停止）', en: 'ClipForge — Recording ({key} to stop)' },
  'tray.tooltipPaused': { zh: '剪录坊 - 已暂停（{key} 停止）', en: 'ClipForge — Paused ({key} to stop)' },
  'tray.show': { zh: '显示控制条', en: 'Show controls' },
  'tray.toggleRecord': { zh: '开始/停止录制（{key}）', en: 'Start/stop recording ({key})' },
  'tray.togglePause': { zh: '暂停/恢复（{key}）', en: 'Pause/resume ({key})' },
  'tray.quit': { zh: '退出', en: 'Quit' }
} as const satisfies Record<string, Entry>

/** 文案 key 类型（写错 key 在编译期即报错） */
export type MessageKey = keyof typeof STRINGS

/** 插值参数 */
export type TranslateParams = Readonly<Record<string, string | number>>

/** 翻译一条文案：查字典 + {name} 占位符插值 */
export const t = (lang: Lang, key: MessageKey, params: TranslateParams | undefined): string => {
  const entry: Entry | undefined = STRINGS[key]
  const text: string = entry === undefined ? String(key) : entry[lang]
  if (params === undefined) {
    return text
  }
  return Object.entries(params).reduce(
    (acc, [name, value]) => acc.replaceAll(`{${name}}`, String(value)),
    text
  )
}

/** 绑定语言的翻译函数（组件与主进程模块各持一份，调用时只写 key） */
export type Translator = (key: MessageKey, params?: TranslateParams) => string

export const translator = (lang: Lang): Translator =>
  (key, params) => t(lang, key, params)

/** 解析持久化配置中的语言字段（非法值一律回退中文） */
export const parseLang = (raw: unknown): Lang => (raw === 'en' ? 'en' : 'zh')
