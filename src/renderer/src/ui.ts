/**
 * 共享按钮与界面样式常量：统一视觉语言（尺寸/圆角/层次），
 * 各视图组合使用，避免 class 字符串散落复制。
 */

const BASE: string =
  'inline-flex h-7 select-none items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-medium ring-1 transition-colors'

export const BTN = {
  base: BASE,
  /** 常规操作（次级） */
  idle: `${BASE} bg-neutral-800/80 text-neutral-100 ring-white/10 hover:bg-neutral-700/90`,
  /** 强调/激活态（选中模式） */
  active: `${BASE} bg-cyan-500 text-white ring-cyan-300/60 shadow-sm shadow-cyan-500/30 hover:bg-cyan-400`,
  /** 危险主操作（开始/导出） */
  danger: `${BASE} bg-red-600 text-white ring-red-500/70 shadow-sm shadow-red-600/30 hover:bg-red-500`,
  /** 亮色强调（停止） */
  light: `${BASE} bg-neutral-100 text-neutral-900 ring-white/40 hover:bg-white`,
  /** 幽灵按钮（图标栏） */
  ghost: `${BASE} bg-transparent text-neutral-400 ring-transparent hover:bg-neutral-800/70 hover:text-neutral-100`,
  /** 微型窗口控制钮 */
  win: 'inline-flex h-6 w-6 select-none items-center justify-center rounded-md text-neutral-500 ring-1 ring-white/10 transition-colors hover:bg-neutral-800 hover:text-neutral-100',
  winClose: 'inline-flex h-6 w-6 select-none items-center justify-center rounded-md text-neutral-500 ring-1 ring-white/10 transition-colors hover:bg-red-600 hover:text-white'
} as const

/** 信息提示条 */
export const NOTICE_CLS: string =
  'flex items-start gap-1.5 rounded-lg bg-amber-400/10 px-3 py-1.5 text-[11px] leading-5 text-amber-300 ring-1 ring-amber-400/20'

/** 小徽章（时长/元信息） */
export const BADGE_CLS: string =
  'rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-neutral-400 ring-1 ring-white/10'

/** 分组卡片容器（设置面板分节） */
export const CARD_CLS: string = 'rounded-xl bg-white/[0.03] p-3 ring-1 ring-white/5'
