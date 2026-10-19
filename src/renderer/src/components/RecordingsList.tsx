import type { JSX } from 'react'
import { useState } from 'react'
import type { RecordingSummary } from '../../../shared/types'
import { useT } from '../i18n'
import { IconFilm } from './icons'
import { BTN } from '../ui'

/** 最近录制列表属性 */
export type RecordingsListProps = {
  readonly recordings: readonly RecordingSummary[]
  readonly onOpen: (summary: RecordingSummary) => void
  /** 管理操作完成后刷新列表 */
  readonly onRefresh: () => void
  /** 批量删除/移除前的准备动作（关闭播放器以释放文件占用） */
  readonly onBeforeManage: () => void
}

/** 秒 → m:ss（纯函数） */
export const formatDuration = (seconds: number): string => {
  const total = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return `${String(minutes)}:${String(rest).padStart(2, '0')}`
}

/** 录制时间 → 本地短文本（纯函数） */
export const formatRecordedAt = (wallMs: number): string => {
  const date = new Date(wallMs)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}

/**
 * 最近录制列表：常规模式双击进入播放剪辑；
 * 管理模式多选后可「删除源文件」（整目录）或「仅移除记录」（保留视频），
 * 全选后操作即等价于清空。
 */
export const RecordingsList = (props: RecordingsListProps): JSX.Element => {
  const { recordings, onOpen, onRefresh, onBeforeManage } = props
  const { t } = useT()
  const [manageMode, setManageMode] = useState<boolean>(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [busy, setBusy] = useState<boolean>(false)
  const [notice, setNotice] = useState<string>('')

  const toggleSelected = (id: string): void => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectedDirs = (): readonly string[] =>
    recordings.filter((item) => selected.has(item.id)).map((item) => item.dirPath)

  /** 执行批量管理操作：先释放播放器占用；失败保留选中便于重试，成功才清空 */
  const runManageAction = (action: 'delete' | 'hide'): void => {
    const dirs = selectedDirs()
    if (dirs.length === 0) {
      setNotice(t('list.selectFirst'))
      return
    }
    onBeforeManage()
    setBusy(true)
    setNotice('')
    const request: Promise<readonly string[]> = action === 'delete'
      ? window.api.deleteRecordingFiles(dirs)
      : window.api.hideRecordingRecords(dirs)
    void request
      .then((failed) => {
        onRefresh()
        if (failed.length === 0) {
          setSelected(new Set())
          return
        }
        // 失败：保留选中便于重试，醒目提示原因
        setNotice(t('list.partialFail', { failed: failed.length, total: dirs.length }))
      })
      .catch((error: unknown) => {
        setNotice(t('list.actionFail', { msg: error instanceof Error ? error.message : String(error) }))
      })
      .finally(() => setBusy(false))
  }

  const allSelected: boolean = recordings.length > 0 && selected.size === recordings.length

  return (
    <div className="flex min-h-0 flex-1 flex-col px-3 pb-2.5 pt-2">
      <div className="mb-1.5 flex shrink-0 items-center gap-1.5 px-1">
        <IconFilm className="h-3 w-3 text-neutral-500" />
        <span className="text-[11px] font-medium text-neutral-500">{t('list.title')}</span>
        <span className="text-[10px] text-neutral-600">{t('list.hint')}</span>
        <button
          className={`${BTN.ghost} ml-auto h-5 !px-1.5 !text-[10px] ${manageMode ? 'text-cyan-300' : ''}`}
          onClick={() => {
            setManageMode(!manageMode)
            setSelected(new Set())
            setNotice('')
          }}
        >
          {manageMode ? t('list.exitManage') : t('list.manage')}
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pr-0.5">
        {recordings.map((item) => {
          const isSelected = selected.has(item.id)
          return (
            <div
              key={item.id}
              className={`group flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 ring-1 transition-all ${
                isSelected
                  ? 'bg-cyan-400/15 ring-cyan-400/40'
                  : 'bg-white/[0.03] ring-white/5 hover:bg-cyan-400/10 hover:ring-cyan-400/30'
              }`}
              onClick={() => {
                if (manageMode) {
                  toggleSelected(item.id)
                }
              }}
              onDoubleClick={() => {
                if (!manageMode) {
                  onOpen(item)
                }
              }}
              title={manageMode ? undefined : item.filePath}
            >
              {manageMode ? (
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold ${
                    isSelected ? 'border-cyan-400 bg-cyan-400 text-neutral-900' : 'border-white/25 text-transparent'
                  }`}
                >
                  ✓
                </span>
              ) : undefined}
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-cyan-400/15 text-cyan-300 ring-1 ring-cyan-400/20">
                <IconFilm className="h-3 w-3" />
              </span>
              <div className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-xs font-medium text-neutral-100">{item.file}</span>
                <span className="text-[10px] text-neutral-500">{formatRecordedAt(item.recordedAtMs)}</span>
              </div>
              <span className="ml-auto shrink-0 rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[10px] tabular-nums text-cyan-300 ring-1 ring-white/10">
                {formatDuration(item.durationSec)}
              </span>
            </div>
          )
        })}
      </div>

      {manageMode && (
        <div className="mt-2 flex shrink-0 items-center gap-1.5">
          <button
            className={`${BTN.ghost} h-6 !px-2 !text-[10px]`}
            onClick={() => setSelected(allSelected ? new Set() : new Set(recordings.map((item) => item.id)))}
          >
            {allSelected ? t('list.deselectAll') : t('list.selectAll')}
          </button>
          <span className="text-[10px] text-neutral-500">{t('list.selectedCount', { n: selected.size })}</span>
          <button
            className={`${BTN.ghost} ml-auto h-6 !px-2 !text-[10px] text-red-300 ring-1 ring-red-400/30 hover:bg-red-500/10 ${busy ? 'pointer-events-none opacity-50' : ''}`}
            onClick={() => runManageAction('delete')}
            title={t('list.deleteFilesTitle')}
          >
            {t('list.deleteFiles')}
          </button>
          <button
            className={`${BTN.ghost} h-6 !px-2 !text-[10px] ${busy ? 'pointer-events-none opacity-50' : ''}`}
            onClick={() => runManageAction('hide')}
            title={t('list.hideRecordsTitle')}
          >
            {t('list.hideRecords')}
          </button>
        </div>
      )}
      {notice.length > 0 && (
        <div className="mt-1.5 shrink-0 rounded-lg bg-amber-400/10 px-2 py-1.5 text-[11px] leading-4 text-amber-300 ring-1 ring-amber-400/25">
          {notice}
        </div>
      )}
    </div>
  )
}
