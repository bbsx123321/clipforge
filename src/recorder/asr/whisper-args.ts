/**
 * whisper-cli 命令行参数构建（纯函数，golden 测试锁定）：
 * - -oj + -of：JSON 结果写入 <outJsonPrefix>.json（含 segments 时间戳）
 * - -pp：stderr 打印进度（whisper_print_progress_callback: progress = N%）
 * - -l auto：语言自动检测（中英混说场景）
 * 输入要求 16kHz mono wav（由 ffmpeg 前置转换）。
 */
export const buildWhisperArgs = (
  modelPath: string,
  wavPath: string,
  outJsonPrefix: string,
  threadCount: number
): readonly string[] => [
  '-m', modelPath,
  '-f', wavPath,
  '-l', 'auto',
  '-oj',
  '-of', outJsonPrefix,
  '-pp',
  '-t', String(threadCount)
]
