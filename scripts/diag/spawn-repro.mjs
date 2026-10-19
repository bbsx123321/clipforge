// 复现实验：用 Node 精确复刻 App 的 ffmpeg spawn 方式，验证是否 spawn 上下文问题
// 变量开关：NO_HIDE=1 关 windowsHide；INHERIT=1 用 stdio inherit
import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'

const ffmpegPath = process.argv[2] ?? 'ffmpeg'
const outputPath = process.argv[3] ?? 'C:\\Users\\boss\\AppData\\Roaming\\desktop-recording-tool\\logs\\spawn-test\\screen-test.mp4'

const args = [
  '-hide_banner', '-loglevel', 'warning', '-y',
  '-f', 'gdigrab', '-framerate', '30', '-i', 'desktop',
  '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18',
  '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
  '-f', 'mp4', outputPath
]

const windowsHide = process.env['NO_HIDE'] !== '1'
const stdio = process.env['INHERIT'] === '1'
  ? 'inherit'
  : ['ignore', 'ignore', 'pipe']
console.log(`变体：windowsHide=${String(windowsHide)} stdio=${stdio === 'inherit' ? 'inherit' : 'pipe'}`)

const child = spawn(ffmpegPath, args, { windowsHide, stdio })
let stderr = ''
if (Array.isArray(stdio)) {
  child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8') })
}
child.on('error', (error) => { console.error('spawn error:', String(error)); process.exit(1) })

setTimeout(() => {
  const size = (() => { try { return statSync(outputPath).size } catch { return -1 } })()
  console.log(`5 秒后文件大小：${String(size)} 字节`)
  if (stderr.length > 0) console.log(`stderr: ${stderr.slice(0, 500)}`)
  child.kill()
  process.exit(size >= 1024 ? 0 : 2)
}, 5000)
