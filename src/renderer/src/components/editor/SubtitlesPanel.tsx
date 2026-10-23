import type { JSX } from 'react'
import { useState } from 'react'
import type {
  AsrStatus,
  ExportSubtitleOptions,
  SubtitleCue,
  SubtitleStyle
} from '../../../../shared/types'
import { BTN } from '../../ui'
import { useT } from '../../i18n'
import { SubtitleStylePanel } from './SubtitleStylePanel'

/**
 * 字幕工作区（时间轴下方）：识别状态条 + cue 编辑 + 样式面板 + 导出选项。
 * 状态语义：none=无麦克风音频；pending=识别中（进度条）；failed=失败可重试；ready=就绪。
 */
export type SubtitlesPanelProps = {
  readonly asrStatus: AsrStatus
  readonly asrProgress: number
  readonly asrError: string | undefined
  readonly cues: readonly SubtitleCue[]
  readonly selectedId: string | undefined
  readonly style: SubtitleStyle
  readonly exportOptions: ExportSubtitleOptions
  readonly onSelect: (id: string | undefined) => void
  readonly onUpdateCueText: (id: string, text: string) => void
  readonly onDeleteCue: (id: string) => void
  readonly onAddCue: () => void
  readonly onClearAll: () => void
  readonly onRetry: () => void
  readonly onStyleChange: (next: SubtitleStyle) => void
  readonly onExportOptionsChange: (next: ExportSubtitleOptions) => void
}

export const SubtitlesPanel = (props: SubtitlesPanelProps): JSX.Element => {
  const {
    asrStatus, asrProgress, asrError, cues, selectedId, style, exportOptions,
    onSelect, onUpdateCueText, onDeleteCue, onAddCue, onClearAll, onRetry,
    onStyleChange, onExportOptionsChange
  } = props
  const { t } = useT()
  const [styleOpen, setStyleOpen] = useState<boolean>(false)
  const [exportOpen, setExportOpen] = useState<boolean>(false)
  const selected: SubtitleCue | undefined = cues.find((cue) => cue.id === selectedId)

  const jumpCue = (delta: number): void => {
    if (cues.length === 0) {
      return
    }
    const index: number = cues.findIndex((cue) => cue.id === selectedId)
    const next: number = index === -1 ? 0 : Math.min(cues.length - 1, Math.max(0, index + delta))
    const target: SubtitleCue | undefined = cues[next]
    if (target !== undefined) {
      onSelect(target.id)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* 状态行 + 工具 */}
      <div className="flex items-center gap-1.5">
        {asrStatus === 'pending' && (
          <span className="flex min-w-0 items-center gap-2 text-[11px] text-violet-300">
            <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-violet-400/40 border-t-violet-300" />
            {t('subtitle.pending', { n: String(Math.round(asrProgress)) })}
            <span className="h-1 w-24 overflow-hidden rounded-full bg-neutral-700">
              <span className="block h-full rounded-full bg-violet-400" style={{ width: `${String(Math.min(100, asrProgress))}%` }} />
            </span>
          </span>
        )}
        {asrStatus === 'failed' && (
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-amber-300">
            <span className="truncate">{t('subtitle.failed', { msg: asrError ?? '' })}</span>
            <button className={`${BTN.idle} !h-6 !px-2 shrink-0`} onClick={onRetry}>{t('subtitle.retry')}</button>
          </span>
        )}
        {asrStatus === 'none' && (
          <span className="truncate text-[11px] text-neutral-500">{t('subtitle.none')}</span>
        )}
        {asrStatus === 'ready' && cues.length === 0 && (
          <span className="text-[11px] text-neutral-500">{t('subtitle.subtitleTrack')}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <button className={`${BTN.idle} !h-6`} onClick={onAddCue} title={t('subtitle.dragHint')}>{t('subtitle.add')}</button>
          <button
            className={`${styleOpen ? BTN.active : BTN.idle} !h-6`}
            onClick={() => setStyleOpen((open) => !open)}
          >
            {t('subtitle.style')}
          </button>
          <button
            className={`${exportOpen ? BTN.active : BTN.idle} !h-6`}
            onClick={() => setExportOpen((open) => !open)}
          >
            {t('subtitle.exportOptions')}
          </button>
          <button className={`${BTN.idle} !h-6`} onClick={onClearAll} disabled={cues.length === 0}>{t('subtitle.clearAll')}</button>
        </span>
      </div>

      {/* 选中 cue 编辑 */}
      {selected !== undefined && (
        <div className="flex items-start gap-1.5 rounded-xl bg-neutral-800/60 p-2 ring-1 ring-violet-400/30">
          <span className="flex shrink-0 flex-col gap-1">
            <button className={`${BTN.idle} !h-6 !px-2`} onClick={() => jumpCue(-1)} title={t('subtitle.prevCue')}>↑</button>
            <button className={`${BTN.idle} !h-6 !px-2`} onClick={() => jumpCue(1)} title={t('subtitle.nextCue')}>↓</button>
          </span>
          <textarea
            className="min-w-0 flex-1 resize-none rounded-lg bg-neutral-900/80 p-1.5 text-xs text-neutral-100 ring-1 ring-white/10 outline-none focus:ring-violet-400/60"
            rows={2}
            value={selected.text}
            placeholder={t('subtitle.cueText')}
            onChange={(event) => onUpdateCueText(selected.id, event.target.value)}
          />
          <span className="flex shrink-0 flex-col gap-1 text-[10px] text-neutral-400">
            <span className="font-mono">{selected.startSec.toFixed(2)}s → {selected.endSec.toFixed(2)}s</span>
            <button className={`${BTN.danger} !h-6`} onClick={() => onDeleteCue(selected.id)}>{t('subtitle.deleteCue')}</button>
          </span>
        </div>
      )}

      {/* 样式面板 */}
      {styleOpen && <SubtitleStylePanel style={style} onChange={onStyleChange} />}

      {/* 导出选项 */}
      {exportOpen && (
        <div className="flex items-center gap-4 rounded-xl bg-neutral-800/60 p-2 text-[11px] text-neutral-300 ring-1 ring-white/10">
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              className="h-3.5 w-3.5 cursor-pointer accent-violet-400"
              type="checkbox" checked={exportOptions.burn}
              onChange={(event) => onExportOptionsChange({ ...exportOptions, burn: event.target.checked })}
            />
            {t('subtitle.exportBurn')}
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              className="h-3.5 w-3.5 cursor-pointer accent-violet-400"
              type="checkbox" checked={exportOptions.srtFile}
              onChange={(event) => onExportOptionsChange({ ...exportOptions, srtFile: event.target.checked })}
            />
            {t('subtitle.exportSrt')}
          </label>
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              className="h-3.5 w-3.5 cursor-pointer accent-violet-400"
              type="checkbox" checked={exportOptions.softTrack}
              onChange={(event) => onExportOptionsChange({ ...exportOptions, softTrack: event.target.checked })}
            />
            {t('subtitle.exportSoft')}
          </label>
        </div>
      )}
    </div>
  )
}
