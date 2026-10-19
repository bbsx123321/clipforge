/** IPC 通道名常量：preload 与主进程共用，避免魔法字符串散落各处 */
export const IPC = {
  /** 列出显示器 */
  listDisplays: 'display/list',
  /** 开始录制（invoke） */
  recordStart: 'record/start',
  /** 暂停录制（invoke） */
  recordPause: 'record/pause',
  /** 恢复录制（invoke） */
  recordResume: 'record/resume',
  /** 停止录制（invoke） */
  recordStop: 'record/stop',
  /** 录制阶段变化广播（主进程 → 渲染进程） */
  recordPhase: 'record/phase',
  /** 录制错误广播（主进程 → 渲染进程，如编码进程意外退出） */
  recordError: 'record/error',
  /** 音频 PCM 块上报（渲染进程 → 主进程，send） */
  audioChunk: 'audio/chunk',
  /** 渲染进程日志转发（渲染进程 → 主进程，send） */
  appLog: 'app/log',
  /** 区域选区确认（overlay 窗口 → 主进程 → 控制条窗口） */
  regionSelected: 'region/selected',
  /** 区域选区取消（overlay 窗口 → 主进程） */
  regionCancel: 'region/cancel',
  /** 请求打开区域选区覆盖层（控制条窗口 → 主进程，invoke） */
  regionPickerOpen: 'region/picker-open',
  /** 控制条窗口高度切换（设置面板开合） */
  windowExpand: 'window/expand',
  /** 隐藏控制条窗口到托盘 */
  windowMinimize: 'window/minimize',
  /** 退出应用（录制中先自动停止并保存产物） */
  windowClose: 'window/close',
  /** 进入待录状态：保存设置并开始 3 秒倒计时（invoke） */
  recordArm: 'record/arm',
  /** 取消倒计时（invoke） */
  recordArmCancel: 'record/arm-cancel',
  /** 渲染进程上报最新设置（快捷键开录入口使用，send） */
  recordArmSnapshot: 'record/arm-snapshot',
  /** 倒计时数字广播（主进程 → 倒计时覆盖层） */
  recordCountdown: 'record/countdown',
  /** 查询录制输出目录 */
  outputDirGet: 'output-dir/get',
  /** 弹出目录选择对话框并持久化（用户取消返回 undefined） */
  outputDirChoose: 'output-dir/choose',
  /** 恢复默认输出目录 */
  outputDirReset: 'output-dir/reset',
  /** 控制条窗口尺寸调整（编辑器/列表/设置视图切换） */
  windowResize: 'window/resize',
  /** 素材库列表（当前输出目录下的录制记录） */
  recordingsList: 'recordings/list',
  /** 批量删除录制源文件（整个 session 目录，带输出根目录前缀校验） */
  recordingsDeleteFiles: 'recordings/delete-files',
  /** 批量仅移除记录（session.json 改名隐藏，保留视频文件） */
  recordingsHideRecords: 'recordings/hide-records',
  /** 导出剪辑工程为 MP4（invoke，带保存对话框） */
  exportRun: 'export/run',
  /** 手动设置窗口位置与尺寸（四角拖拽缩放） */
  windowSetBounds: 'window/set-bounds',
  /** 查询当前生效的快捷键配置 */
  hotkeysGet: 'hotkeys/get',
  /** 更新快捷键（注册失败自动回滚并返回 false） */
  hotkeysUpdate: 'hotkeys/update',
  /** 关闭录制区域红色描边覆盖层（清除区域/切回全屏时） */
  regionFrameClose: 'region/frame-close',
  /** 打开窗口捕获选择覆盖层（invoke） */
  windowPickerOpen: 'window/picker-open',
  /** 探查当前光标下的窗口（invoke，返回矩形与标题；无有效窗口返回 undefined） */
  windowHoverProbe: 'window/hover-probe',
  /** 确认捕获当前高亮窗口（invoke，返回最终探查结果；无窗口返回 undefined） */
  windowPick: 'window/pick',
  /** 取消窗口选择（send） */
  windowPickerCancel: 'window/picker-cancel',
  /** 窗口已选定广播（主进程 → 控制条：写入录制模式） */
  windowSelected: 'window/selected',
  /** 查询界面语言（invoke） */
  languageGet: 'language/get',
  /** 设置界面语言并持久化（invoke；主进程同步刷新托盘文案） */
  languageSet: 'language/set',
  /** 界面语言变化广播（主进程 → 全部窗口） */
  languageChanged: 'language/changed'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
