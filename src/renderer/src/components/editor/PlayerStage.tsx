import type { JSX } from 'react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { mediaUrlFor } from '../../../../shared/media-url'
import type { SubtitleCue, SubtitleStyle } from '../../../../shared/types'
import { useT } from '../../i18n'
import { BTN } from '../../ui'
import { IconPause, IconPlay } from '../icons'
import { SubtitleOverlay } from './SubtitleOverlay'

/**
 * 播放器舞台：video 元素 + 字幕叠加层 + 中央播放按钮 + 播放控制行（倍速循环）。
 * 对外通过 PlayerHandle.seek 暴露 seek 能力（轨道/滑轨共用），当前时间经 onTimeUpdate 上抛。
 */
export type PlayerHandle = {
  readonly seek: (seconds: number) => void
}

export type PlayerStageProps = {
  readonly src: string
  readonly durationSec: number
  readonly cues: readonly SubtitleCue[]
  readonly style: SubtitleStyle
  readonly onTimeUpdate: (seconds: number) => void
  readonly onNotice: (message: string) => void
}

/** 播放倍速档位（点击循环） */
const RATES: readonly number[] = [1, 1.5, 2, 4]

/** 秒 → m:ss */
const clock = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(total / 60))}:${String(total % 60).padStart(2, '0')}`
}

export const PlayerStage = forwardRef<PlayerHandle, PlayerStageProps>(
  (props: PlayerStageProps, ref): JSX.Element => {
    const { src, durationSec, cues, style, onTimeUpdate, onNotice } = props
    const { t } = useT()
    const videoRef = useRef<HTMLVideoElement | undefined>(undefined)
    const [playing, setPlaying] = useState<boolean>(false)
    const [currentTime, setCurrentTime] = useState<number>(0)
    const [rateIndex, setRateIndex] = useState<number>(0)
    const [videoSize, setVideoSize] = useState<{ readonly w: number; readonly h: number }>({ w: 0, h: 0 })

    useImperativeHandle(ref, (): PlayerHandle => ({
      seek: (seconds: number): void => {
        const video = videoRef.current
        if (video !== undefined) {
          video.currentTime = seconds
          setCurrentTime(seconds)
        }
      }
    }), [])

    // 播放倍速切换即时生效
    useEffect(() => {
      const video = videoRef.current
      if (video !== undefined) {
        video.playbackRate = RATES[rateIndex] ?? 1
      }
    }, [rateIndex])

    const togglePlay = (): void => {
      const video = videoRef.current
      if (video === undefined) {
        return
      }
      if (video.paused) {
        // play() 可能因加载失败/策略被拒——显式提示而不是静默无反应
        video.play().catch((error: unknown) => {
          onNotice(t('editor.playFail', { msg: error instanceof Error ? error.message : String(error) }))
        })
      } else {
        video.pause()
      }
    }

    return (
      <>
        {/* 播放器 */}
        <div className="relative min-h-0 w-full flex-1 overflow-hidden rounded-xl bg-black ring-1 ring-white/10">
          <video
            ref={videoRef as RefObject<HTMLVideoElement>}
            className="h-full w-full object-contain"
            src={src}
            onTimeUpdate={(event) => {
              setCurrentTime(event.currentTarget.currentTime)
              onTimeUpdate(event.currentTarget.currentTime)
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onError={() => onNotice(t('editor.loadFail'))}
            onLoadedMetadata={(event) => {
              const video = event.currentTarget
              setVideoSize({ w: video.videoWidth, h: video.videoHeight })
            }}
            onClick={togglePlay}
          />
          {/* 字幕叠加层（按样式实时渲染当前 cue，所见即所得） */}
          <SubtitleOverlay
            cues={cues}
            style={style}
            currentTime={currentTime}
            videoWidth={videoSize.w}
            videoHeight={videoSize.h}
          />
          {/* 中央播放按钮（暂停时浮现，点击画面也可切换） */}
          {!playing && (
            <button
              className="absolute inset-0 m-auto flex h-14 w-14 items-center justify-center rounded-full bg-black/50 text-white ring-1 ring-white/25 backdrop-blur-sm transition-colors hover:bg-black/70"
              onClick={togglePlay}
              title={t('editor.play')}
            >
              <IconPlay className="ml-0.5 h-5 w-5" />
            </button>
          )}
        </div>

        {/* 播放控制行 */}
        <div className="flex items-center gap-2.5 px-1">
          <button
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-900 shadow ring-1 ring-white/40 transition-colors hover:bg-white"
            onClick={togglePlay}
            title={playing ? t('common.pause') : t('editor.play')}
          >
            {playing ? <IconPause className="h-3.5 w-3.5" /> : <IconPlay className="ml-0.5 h-3.5 w-3.5" />}
          </button>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-neutral-300">
            {clock(currentTime)}
          </span>
          <input
            className="h-1.5 min-w-0 flex-1 cursor-pointer accent-cyan-400"
            type="range"
            min={0}
            max={durationSec}
            step={0.05}
            value={Math.min(currentTime, durationSec)}
            onChange={(event) => {
              const seconds: number = Number(event.target.value)
              const video = videoRef.current
              if (video !== undefined) {
                video.currentTime = seconds
                setCurrentTime(seconds)
              }
            }}
          />
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-neutral-500">{clock(durationSec)}</span>
          <button className={`${BTN.idle} h-6 shrink-0 font-mono !text-[11px]`} onClick={() => setRateIndex((rateIndex + 1) % RATES.length)}>
            {String(RATES[rateIndex])}x
          </button>
        </div>
      </>
    )
  }
)

PlayerStage.displayName = 'PlayerStage'
