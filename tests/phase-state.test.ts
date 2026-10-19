import { describe, expect, it } from 'vitest'
import { transitionRecordPhase } from '../src/core/recording/phase-state'

describe('录制阶段状态机', () => {
  it('idle 经 start 进入 recording', () => {
    expect(transitionRecordPhase('idle', 'start')).toEqual({ ok: true, next: 'recording' })
  })

  it('recording 经 pause 进入 paused、经 stop 回到 idle', () => {
    expect(transitionRecordPhase('recording', 'pause')).toEqual({ ok: true, next: 'paused' })
    expect(transitionRecordPhase('recording', 'stop')).toEqual({ ok: true, next: 'idle' })
  })

  it('paused 经 resume 回到 recording、经 stop 回到 idle', () => {
    expect(transitionRecordPhase('paused', 'resume')).toEqual({ ok: true, next: 'recording' })
    expect(transitionRecordPhase('paused', 'stop')).toEqual({ ok: true, next: 'idle' })
  })

  it('非法转移一律拒绝并给出原因', () => {
    expect(transitionRecordPhase('idle', 'pause')).toMatchObject({ ok: false })
    expect(transitionRecordPhase('idle', 'resume')).toMatchObject({ ok: false })
    expect(transitionRecordPhase('idle', 'stop')).toMatchObject({ ok: false })
    expect(transitionRecordPhase('recording', 'start')).toMatchObject({ ok: false })
    expect(transitionRecordPhase('recording', 'resume')).toMatchObject({ ok: false })
    expect(transitionRecordPhase('paused', 'start')).toMatchObject({ ok: false })
    expect(transitionRecordPhase('paused', 'pause')).toMatchObject({ ok: false })
  })

  it('拒绝结果包含可读原因', () => {
    const result = transitionRecordPhase('idle', 'stop')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toContain('idle')
      expect(result.reason).toContain('stop')
    }
  })
})
