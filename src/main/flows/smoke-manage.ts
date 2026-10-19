import { app } from 'electron'
import { existsSync } from 'node:fs'
import log from 'electron-log/main'
import { resolveFfprobePath } from '../../recorder/ffmpeg/ffmpeg-path'
import { listRecordings } from '../media-service'
import { startRecording, stopRecording, getOutputDirInfo } from '../record-controller'
import { getControlWindow } from '../windows'
import type { RecordSettings } from '../../shared/types'

const sleep = (ms: number): Promise<void> => new Promise<void>((resolve) => setTimeout(resolve, ms))

/**
 * 素材管理冒烟（--smoke-manage）：录制一条 → 停止 → 列表扫描 → 全部删除 → 复扫断言为空。
 * 覆盖用户反馈的「全选删除失效」：端到端复现 IPC → 路径校验 → rmSync 全链路。
 */
export const runManageFlow = async (): Promise<void> => {
  await sleep(2000)
  const settings: RecordSettings = {
    mode: { kind: 'fullscreen', outputIndex: 0 },
    framerate: 30,
    captureSystemAudio: false,
    captureMicrophone: false
  }
  const start = await startRecording(settings)
  if (!start.ok) {
    log.error(`[smoke-manage] 启动失败：${start.error}`)
    app.exit(1)
    return
  }
  await sleep(6000)
  const stop = await stopRecording()
  if (!stop.ok) {
    log.error(`[smoke-manage] 停止失败：${stop.error}`)
    app.exit(1)
    return
  }
  const root: string = getOutputDirInfo().dir
  const ffprobePath: string = resolveFfprobePath(app.getAppPath(), app.isPackaged)
  const before = await listRecordings(root, ffprobePath)
  log.info(`[smoke-manage] 删除前列表（主进程视角）：${String(before.length)} 条，输出根：${root}`)
  if (before.length === 0) {
    log.error('[smoke-manage] 列表为空，无法验证删除')
    app.exit(1)
    return
  }
  // 走真实用户路径：渲染进程 window.api → preload/IPC → 主进程（含序列化）
  const win = getControlWindow()
  if (win === undefined) {
    log.error('[smoke-manage] 控制条窗口不存在')
    app.exit(1)
    return
  }
  const probe: unknown = await win.webContents.executeJavaScript(`
    (async () => {
      const list = await window.api.listRecordings()
      const failed = await window.api.deleteRecordingFiles(list.map((item) => item.dirPath))
      const after = await window.api.listRecordings()
      return JSON.stringify({ before: list.length, failed: failed.length, failedDirs: failed, after: after.length })
    })()
  `)
  log.info(`[smoke-manage] 渲染端全链路结果：${String(probe)}`)
  const afterAgain = await listRecordings(root, ffprobePath)
  const allGone: boolean = before.every((item) => !existsSync(item.dirPath))
  log.info(`[smoke-manage] 主进程复扫：${String(afterAgain.length)} 条；目录实际全部消失：${allGone ? '是' : '否'}`)
  const passed: boolean = String(probe).includes('"failed":0') && String(probe).includes('"after":0')
  app.exit(passed ? 0 : 1)
}
