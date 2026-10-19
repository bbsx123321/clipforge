// 矩阵实验：不同 spawn 配置下 ffmpeg ddagrab 能否产出帧（stderr 的 frame 计数判定）
// 用法：node scripts/ddagrab-matrix.mjs
import { spawn } from 'node:child_process'

const ffmpegPath = process.argv[2] ?? 'ffmpeg'
const RUN_MS = 4000

const configs = [
  { name: 'A: windowsHide=true  stdio=pipe',  opts: { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] } },
  { name: 'B: windowsHide=false stdio=pipe',  opts: { windowsHide: false, stdio: ['ignore', 'ignore', 'pipe'] } },
  { name: 'C: windowsHide=true  stdio=ignore', opts: { windowsHide: true, stdio: 'ignore' } },
  { name: 'D: detached=true     stdio=pipe',  opts: { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'], detached: true } }
]

const args = [
  '-hide_banner', '-loglevel', 'info',
  '-f', 'lavfi', '-i', 'ddagrab=framerate=30',
  '-c:v', 'h264_nvenc',
  '-f', 'null', '-'
]

const runOne = (config) =>
  new Promise((resolve) => {
    const child = spawn(ffmpegPath, args, config.opts)
    let stderr = ''
    child.stderr?.on('data', (chunk) => { stderr += chunk.toString('utf8') })
    child.on('error', () => resolve(-1))
    setTimeout(() => {
      child.kill()
      const matches = [...stderr.matchAll(/frame=\s*(\d+)/g)]
      const lastFrame = matches.length > 0 ? Number(matches[matches.length - 1][1]) : -1
      resolve(lastFrame)
    }, RUN_MS)
  })

for (const config of configs) {
  const frames = await runOne(config)
  console.log(`${config.name}  →  最后 frame 计数: ${String(frames)}`)
}
console.log('（>0 即捕获成功；-1 表示进程启动失败/无输出）')
