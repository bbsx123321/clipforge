/** 播放器媒体 URL（app://media/<encoded-abs-path>；主进程协议处理器按 host=media 分流） */
export const mediaUrlFor = (absolutePath: string): string =>
  `app://media/${encodeURIComponent(absolutePath)}`
