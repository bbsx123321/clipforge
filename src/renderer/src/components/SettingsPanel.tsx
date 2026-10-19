import type { JSX } from 'react'
import { useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import type { DisplayInfo, Framerate, HotkeyConfig, OutputDirInfo, RecordSettings } from '../../../shared/types'
import { keyboardEventToAccelerator } from '../../../core/hotkeys'
import { useT } from '../i18n'
import { IconFast, IconFilm, IconGlobe, IconMic, IconVolume } from './icons'
import { BTN, CARD_CLS } from '../ui'

/** 设置面板属性 */
export type SettingsPanelProps = {
  readonly displays: readonly DisplayInfo[]
  readonly settings: RecordSettings
  readonly onSettingsChange: (next: RecordSettings) => void
  readonly outputDir: OutputDirInfo | undefined
  readonly onChooseOutputDir: () => void
  readonly onResetOutputDir: () => void
  readonly hotkeys: HotkeyConfig
  readonly onUpdateHotkey: (which: 'record' | 'pause', accelerator: string) => void
}

const LABEL_CLS = 'text-[11px] font-medium text-neutral-400'
const CONTROL_CLS = 'rounded-lg bg-neutral-800/80 px-2 py-1 text-xs text-neutral-100 ring-1 ring-white/10 outline-none focus:ring-cyan-400/50'

/** 开关行（复选框样式化为 toggle） */
const ToggleRow = (props: {
  readonly icon: JSX.Element
  readonly label: string
  readonly checked: boolean
  readonly onChange: (checked: boolean) => void
}): JSX.Element => (
  <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-neutral-200">
    <span className="text-neutral-400">{props.icon}</span>
    {props.label}
    <span
      className={`ml-auto relative inline-flex h-4.5 w-8 shrink-0 items-center rounded-full transition-colors ${
        props.checked ? 'bg-cyan-500' : 'bg-neutral-700'
      }`}
      onClick={(event) => {
        event.preventDefault()
        props.onChange(!props.checked)
      }}
    >
      <span
        className={`absolute h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${
          props.checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </span>
  </label>
)

/** 快捷键捕获按钮（点击后按新组合键；Esc 取消） */
const HotkeyCaptureButton = (props: {
  readonly label: string
  readonly accelerator: string
  readonly onApply: (accelerator: string) => void
}): JSX.Element => {
  const { t } = useT()
  const [capturing, setCapturing] = useState<boolean>(false)

  useEffect(() => {
    if (!capturing) {
      return undefined
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        setCapturing(false)
        return
      }
      const accelerator: string | undefined = keyboardEventToAccelerator(event)
      if (accelerator !== undefined) {
        setCapturing(false)
        props.onApply(accelerator)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [capturing, props])

  return (
    <button
      className={`h-6 min-w-[72px] rounded-lg px-2 font-mono text-[11px] ring-1 transition-colors ${
        capturing
          ? 'animate-pulse bg-cyan-500/20 text-cyan-200 ring-cyan-400/50'
          : 'bg-neutral-800/80 text-neutral-100 ring-white/10 hover:bg-neutral-700/90'
      }`}
      onClick={() => setCapturing(!capturing)}
      title={capturing ? t('settings.hotkeyCaptureHint') : t('settings.hotkeyChangeTitle')}
    >
      {capturing ? t('settings.hotkeyCapturing') : props.accelerator}
    </button>
  )
}

/** 语言选项按钮（当前语言高亮） */
const LangOption = (props: {
  readonly active: boolean
  readonly label: string
  readonly onClick: () => void
}): JSX.Element => (
  <button
    className={`h-6 flex-1 rounded-lg px-2 text-[11px] ring-1 transition-colors ${
      props.active
        ? 'bg-cyan-500/20 text-cyan-200 ring-cyan-400/50'
        : 'bg-neutral-800/80 text-neutral-200 ring-white/10 hover:bg-neutral-700/90'
    }`}
    onClick={props.onClick}
  >
    {props.label}
  </button>
)

export const SettingsPanel = (props: SettingsPanelProps): JSX.Element => {
  const { displays, settings, onSettingsChange, outputDir, onChooseOutputDir, onResetOutputDir, hotkeys, onUpdateHotkey } = props
  const { t, lang, setLang } = useT()

  const onDisplayChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const outputIndex: number = Number(event.target.value)
    // 切换显示器后区域坐标的参照系改变，重置为整屏（同步收起区域描边）
    window.api.closeRegionFrame()
    onSettingsChange({ ...settings, mode: { kind: 'fullscreen', outputIndex } })
  }

  const onFramerateChange = (event: ChangeEvent<HTMLSelectElement>): void => {
    const framerate: Framerate = Number(event.target.value) === 60 ? 60 : 30
    onSettingsChange({ ...settings, framerate })
  }

  return (
    <div className="flex flex-col gap-2.5">
      {/* 语言 */}
      <div className={CARD_CLS}>
        <div className="mb-2 flex items-center gap-1.5">
          <IconGlobe className="h-3.5 w-3.5 text-cyan-400/80" />
          <span className={LABEL_CLS}>{t('settings.language')}</span>
        </div>
        <div className="flex items-center gap-2">
          <LangOption
            active={lang === 'zh'}
            label={t('lang.zh')}
            onClick={() => setLang('zh')}
          />
          <LangOption
            active={lang === 'en'}
            label={t('lang.en')}
            onClick={() => setLang('en')}
          />
        </div>
      </div>

      {/* 画面 */}
      <div className={CARD_CLS}>
        <div className="mb-2 flex items-center gap-1.5">
          <IconFilm className="h-3.5 w-3.5 text-cyan-400/80" />
          <span className={LABEL_CLS}>{t('settings.video')}</span>
        </div>
        <div className="flex items-center gap-2">
          <select className={`${CONTROL_CLS} min-w-0 flex-1`} value={settings.mode.outputIndex} onChange={onDisplayChange}>
            {displays.map((display) => (
              <option key={display.id} value={display.outputIndex}>
                {display.label}（{String(display.width)}×{String(display.height)}）
              </option>
            ))}
          </select>
          <select className={CONTROL_CLS} value={settings.framerate} onChange={onFramerateChange}>
            <option value={30}>30 fps</option>
            <option value={60}>60 fps</option>
          </select>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <button className={`${BTN.ghost} h-6 !px-2 text-cyan-300 ring-1 ring-white/10`} onClick={() => void window.api.openRegionPicker()}>
            {settings.mode.kind === 'region' ? t('settings.repickRegion') : t('settings.pickRegion')}
          </button>
          <button className={`${BTN.ghost} h-6 !px-2 text-cyan-300 ring-1 ring-white/10`} onClick={() => void window.api.openWindowPicker()}>
            {settings.mode.kind === 'window' ? t('settings.repickWindow') : t('settings.pickWindow')}
          </button>
          {(settings.mode.kind === 'region' || settings.mode.kind === 'window') && (
            <span className="font-mono text-[10px] tabular-nums text-cyan-300">
              {String(settings.mode.region.width)}×{String(settings.mode.region.height)}
              <button
                className="ml-1.5 text-neutral-500 hover:text-neutral-200"
                onClick={() => {
                  window.api.closeRegionFrame()
                  onSettingsChange({
                    ...settings,
                    mode: { kind: 'fullscreen', outputIndex: settings.mode.outputIndex }
                  })
                }}
              >
                ✕
              </button>
            </span>
          )}
        </div>
        {settings.mode.kind === 'window' && (
          <div className="mt-1.5 truncate text-[10px] text-neutral-500" title={settings.mode.title}>
            {t('settings.windowHint', { title: settings.mode.title })}
          </div>
        )}
      </div>

      {/* 声音 */}
      <div className={CARD_CLS}>
        <div className="mb-2 flex items-center gap-1.5">
          <IconVolume className="h-3.5 w-3.5 text-cyan-400/80" />
          <span className={LABEL_CLS}>{t('settings.audio')}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <ToggleRow
            icon={<IconVolume className="h-3.5 w-3.5" />}
            label={t('settings.systemSound')}
            checked={settings.captureSystemAudio}
            onChange={(checked) => onSettingsChange({ ...settings, captureSystemAudio: checked })}
          />
          <ToggleRow
            icon={<IconMic className="h-3.5 w-3.5" />}
            label={t('settings.microphone')}
            checked={settings.captureMicrophone}
            onChange={(checked) => onSettingsChange({ ...settings, captureMicrophone: checked })}
          />
        </div>
      </div>

      {/* 存储 */}
      <div className={CARD_CLS}>
        <div className="mb-2 flex items-center gap-1.5">
          <IconFast className="invisible h-3.5 w-3.5" />
          <span className={LABEL_CLS}>{t('settings.storage')}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-neutral-300" title={outputDir?.dir ?? ''}>
            {outputDir?.dir ?? t('common.loading')}
          </span>
          <button className={`${BTN.ghost} h-6 !px-2 text-cyan-300 ring-1 ring-white/10`} onClick={onChooseOutputDir}>
            {t('common.change')}
          </button>
          {outputDir !== undefined && !outputDir.isDefault && (
            <button className={`${BTN.ghost} h-6 !px-2`} onClick={onResetOutputDir}>
              {t('common.resetDefault')}
            </button>
          )}
        </div>
      </div>

      {/* 快捷键 */}
      <div className={CARD_CLS}>
        <div className="mb-2 flex items-center gap-1.5">
          <IconFast className="h-3.5 w-3.5 text-cyan-400/80" />
          <span className={LABEL_CLS}>{t('settings.hotkeys')}</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2 text-xs text-neutral-200">
            <span className="w-16 shrink-0">{t('settings.hotkeyRecord')}</span>
            <HotkeyCaptureButton
              label="record"
              accelerator={hotkeys.record}
              onApply={(accelerator) => onUpdateHotkey('record', accelerator)}
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-200">
            <span className="w-16 shrink-0">{t('settings.hotkeyPause')}</span>
            <HotkeyCaptureButton
              label="pause"
              accelerator={hotkeys.pause}
              onApply={(accelerator) => onUpdateHotkey('pause', accelerator)}
            />
          </div>
          <div className="text-[10px] text-neutral-500">{t('settings.hotkeyHint')}</div>
        </div>
      </div>
    </div>
  )
}
