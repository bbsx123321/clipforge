import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import { useT } from '../i18n'

/**
 * 倒计时覆盖层：全屏透明、点击穿透（窗口级设置），屏幕中央显示 3-2-1 大数字。
 * 数字由主进程每秒广播（IPC.recordCountdown），倒计时结束主进程直接关闭本窗口。
 */
export const CountdownOverlay = (): JSX.Element => {
  const { t } = useT()
  const [seconds, setSeconds] = useState<number>(3)

  useEffect(() => {
    const unsubscribe = window.api.onCountdown((next) => setSeconds(next))
    return unsubscribe
  }, [])

  return (
    <div className="flex h-full w-full select-none flex-col items-center justify-center bg-transparent">
      <div className="flex h-44 w-44 items-center justify-center rounded-full bg-neutral-900/70 ring-2 ring-red-500/70 shadow-2xl shadow-red-900/40 backdrop-blur-md">
        <span key={seconds} className="countdown-pop text-8xl font-bold tabular-nums text-white drop-shadow-lg">
          {String(seconds)}
        </span>
      </div>
      <div className="mt-5 text-sm font-medium tracking-wide text-neutral-200 drop-shadow">
        {t('countdown.title')}
      </div>
      <div className="mt-1 text-[11px] text-neutral-400">{t('countdown.hint')}</div>
    </div>
  )
}
