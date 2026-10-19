import log from 'electron-log/main'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import type { App } from 'electron'

/**
 * 初始化文件日志：开发期写项目根 logs/main.log，打包后写用户数据目录。
 * 必须在 app ready 之后调用（依赖 app.getAppPath / userData）。
 */
export const initLogging = (app: App): void => {
  const logsDir: string = app.isPackaged
    ? path.join(app.getPath('userData'), 'logs')
    : path.join(app.getAppPath(), 'logs')
  mkdirSync(logsDir, { recursive: true })
  log.transports.file.resolvePathFn = (): string => path.join(logsDir, 'main.log')
  log.transports.file.level = 'info'
  log.initialize()
  log.info('应用启动')
}
