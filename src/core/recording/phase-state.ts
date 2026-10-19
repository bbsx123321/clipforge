import type { RecordPhase } from '../../shared/types'

/**
 * 录制阶段状态机：纯函数，不持有任何状态。
 * 转移规则：
 *   idle      --start-->  recording
 *   recording --pause-->  paused
 *   recording --stop--->  idle
 *   paused    --resume-> recording
 *   paused    --stop--->  idle
 */
export type RecordAction = 'start' | 'pause' | 'resume' | 'stop'

export type PhaseTransition =
  | { readonly ok: true; readonly next: RecordPhase }
  | { readonly ok: false; readonly reason: string }

/** 各阶段允许执行的动作集合 */
const ALLOWED_ACTIONS: Readonly<Record<RecordPhase, readonly RecordAction[]>> = {
  idle: ['start'],
  recording: ['pause', 'stop'],
  paused: ['resume', 'stop']
}

/** 动作执行后的目标阶段 */
const TARGET_PHASE: Readonly<Record<RecordAction, RecordPhase>> = {
  start: 'recording',
  resume: 'recording',
  pause: 'paused',
  stop: 'idle'
}

/** 计算录制阶段转移结果；非法转移返回失败原因，不抛异常（纯函数） */
export const transitionRecordPhase = (current: RecordPhase, action: RecordAction): PhaseTransition => {
  const allowed = ALLOWED_ACTIONS[current]
  if (!allowed.includes(action)) {
    return { ok: false, reason: `阶段 ${current} 不允许执行动作 ${action}` }
  }
  return { ok: true, next: TARGET_PHASE[action] }
}
