import type { JSX } from 'react'
import type { SubtitleStyle } from '../../../../shared/types'
import { useT } from '../../i18n'

/**
 * 字幕样式面板：字号/位置/边距/文字不透明度/黑底开关及不透明度。
 * 参数语义与烧录 ASS 一致（相对视频画面百分比），预览即所得。
 */
export type SubtitleStylePanelProps = {
  readonly style: SubtitleStyle
  readonly onChange: (next: SubtitleStyle) => void
}

/** 行容器（label + 控件 + 数值显示） */
const row = (label: string, control: JSX.Element, value: string): JSX.Element => (
  <label className="flex items-center gap-2 text-[11px] text-neutral-300">
    <span className="w-20 shrink-0 text-right">{label}</span>
    {control}
    <span className="w-10 shrink-0 font-mono text-[10px] text-neutral-500">{value}</span>
  </label>
)

export const SubtitleStylePanel = (props: SubtitleStylePanelProps): JSX.Element => {
  const { style, onChange } = props
  const { t } = useT()
  const slider = 'h-1 w-36 cursor-pointer accent-violet-400'

  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-neutral-800/60 p-2 ring-1 ring-white/10">
      {row(
        t('subtitle.styleSize'),
        <input
          className={slider}
          type="range" min={3} max={8} step={0.5}
          value={style.fontSizePct}
          onChange={(event) => onChange({ ...style, fontSizePct: Number(event.target.value) })}
        />,
        `${String(style.fontSizePct)}%`
      )}
      {row(
        t('subtitle.stylePosition'),
        <span className="flex gap-1">
          <button
            className={`h-6 rounded-md px-2 text-[11px] ${style.position === 'bottom' ? 'bg-violet-500 text-white' : 'bg-neutral-700/70 text-neutral-300'}`}
            onClick={() => onChange({ ...style, position: 'bottom' })}
          >
            {t('subtitle.styleBottom')}
          </button>
          <button
            className={`h-6 rounded-md px-2 text-[11px] ${style.position === 'top' ? 'bg-violet-500 text-white' : 'bg-neutral-700/70 text-neutral-300'}`}
            onClick={() => onChange({ ...style, position: 'top' })}
          >
            {t('subtitle.styleTop')}
          </button>
        </span>,
        ''
      )}
      {row(
        t('subtitle.styleMargin'),
        <input
          className={slider}
          type="range" min={2} max={20} step={1}
          value={style.marginPct}
          onChange={(event) => onChange({ ...style, marginPct: Number(event.target.value) })}
        />,
        `${String(style.marginPct)}%`
      )}
      {row(
        t('subtitle.styleTextOpacity'),
        <input
          className={slider}
          type="range" min={0.5} max={1} step={0.05}
          value={style.textOpacity}
          onChange={(event) => onChange({ ...style, textOpacity: Number(event.target.value) })}
        />,
        String(style.textOpacity.toFixed(2))
      )}
      {row(
        t('subtitle.styleBox'),
        <input
          className="h-3.5 w-3.5 cursor-pointer accent-violet-400"
          type="checkbox"
          checked={style.boxEnabled}
          onChange={(event) => onChange({ ...style, boxEnabled: event.target.checked })}
        />,
        ''
      )}
      {style.boxEnabled &&
        row(
          t('subtitle.styleBoxOpacity'),
          <input
            className={slider}
            type="range" min={0.3} max={1} step={0.05}
            value={style.boxOpacity}
            onChange={(event) => onChange({ ...style, boxOpacity: Number(event.target.value) })}
          />,
          String(style.boxOpacity.toFixed(2))
        )}
    </div>
  )
}
