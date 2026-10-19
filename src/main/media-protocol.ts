import { protocol } from 'electron'
import { promises as fsPromises } from 'node:fs'
import path from 'node:path'

/**
 * app:// 自定义协议（替代 file:// 加载渲染资源）：
 * - app://bundle/<path>  → 构建产物 out/renderer/<path>（页面与静态资源）
 * - app://media/<encoded-abs-path> → 磁盘视频文件（播放器源；支持 Range 分段请求以快进快退）
 * 原因：AudioWorklet/ES 模块加载内部走 fetch，file:// 不可 fetch；
 * 且 <video> 的 seek 需要 206 Range 响应，这里显式实现。
 */

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.mp4': 'video/mp4',
  '.mkv': 'video/x-matroska',
  '.wav': 'audio/wav'
}

/** 解析 Range 头（bytes=start-end）为 [start, end]；非法返回 undefined */
const parseRange = (rangeHeader: string | undefined, totalBytes: number): readonly [number, number] | undefined => {
  if (rangeHeader === undefined) {
    return undefined
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim())
  if (match === null) {
    return undefined
  }
  const startRaw: string | undefined = match[1]
  const endRaw: string | undefined = match[2]
  if ((startRaw === undefined || startRaw.length === 0) && (endRaw === undefined || endRaw.length === 0)) {
    return undefined
  }
  // 仅支持 start-end / start- 两种形式（video 元素的 seek 行为足够）
  const start: number = startRaw !== undefined && startRaw.length > 0 ? Number(startRaw) : 0
  const end: number = endRaw !== undefined && endRaw.length > 0 ? Math.min(Number(endRaw), totalBytes - 1) : totalBytes - 1
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= totalBytes) {
    return undefined
  }
  return [start, end]
}

/** 单个文件请求 → Response（含 Range 206 与 404/403） */
const serveFile = async (filePath: string, rangeHeader: string | undefined): Promise<Response> => {
  let stat: { size: number }
  try {
    stat = await fsPromises.stat(filePath)
  } catch {
    return new Response('not found', { status: 404 })
  }
  const contentType: string = MIME_TYPES[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  const range = parseRange(rangeHeader, stat.size)
  if (range !== undefined) {
    const [start, end] = range
    const handle = await fsPromises.open(filePath, 'r')
    try {
      const length: number = end - start + 1
      const buffer = Buffer.alloc(length)
      await handle.read(buffer, 0, length, start)
      return new Response(buffer, {
        status: 206,
        headers: {
          'content-type': contentType,
          'content-range': `bytes ${String(start)}-${String(end)}/${String(stat.size)}`,
          'accept-ranges': 'bytes'
        }
      })
    } finally {
      await handle.close()
    }
  }
  const body = await fsPromises.readFile(filePath)
  return new Response(body, {
    status: 200,
    headers: { 'content-type': contentType, 'accept-ranges': 'bytes' }
  })
}

/** 注册 app 协议处理器（bundle 静态资源 + media 视频流） */
export const registerAppProtocol = (rendererDir: string): void => {
  protocol.handle('app', (request) => {
    const url = new URL(request.url)
    if (url.host === 'media') {
      // 路径为 encodeURIComponent 后的绝对路径，形如 /C%3A%5CUsers%5C...
      const encoded = url.pathname.replace(/^\//, '')
      const filePath = path.normalize(decodeURIComponent(encoded))
      return serveFile(filePath, request.headers.get('range') ?? undefined)
    }
    const pathname = decodeURIComponent(url.pathname)
    const filePath = path.normalize(path.join(rendererDir, pathname))
    if (!filePath.startsWith(rendererDir)) {
      return Promise.resolve(new Response('forbidden', { status: 403 }))
    }
    return serveFile(filePath, undefined)
  })
}

/** 注册协议特权（必须在 app ready 之前调用） */
export const registerAppSchemePrivileges = (): void => {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'app',
      privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
  ])
}
