import type { JSX } from 'react'

/**
 * 内联 SVG 图标库（feather 风格：2px 描边、跟随文字颜色）。
 * 不引第三方图标库，保持零依赖与统一视觉。
 */

type IconProps = {
  readonly className: string
}

const svg = (className: string, children: readonly string[]): JSX.Element => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children.map((element, index) => (
      <g key={String(index)} dangerouslySetInnerHTML={{ __html: element }} />
    ))}
  </svg>
)

export const IconPlay = (props: IconProps): JSX.Element =>
  svg(props.className, ['<polygon points="6 4 20 12 6 20 6 4" />'])

export const IconPause = (props: IconProps): JSX.Element =>
  svg(props.className, ['<rect x="5" y="4" width="4.5" height="16" rx="1" />', '<rect x="14.5" y="4" width="4.5" height="16" rx="1" />'])

export const IconStop = (props: IconProps): JSX.Element =>
  svg(props.className, ['<rect x="5.5" y="5.5" width="13" height="13" rx="2" />'])

export const IconSettings = (props: IconProps): JSX.Element =>
  svg(props.className, [
    '<line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" />',
    '<line x1="12" y1="21" x2="12" y2="12" /><line x1="12" y1="8" x2="12" y2="3" />',
    '<line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />',
    '<line x1="1" y1="14" x2="7" y2="14" /><line x1="9" y1="8" x2="15" y2="8" /><line x1="17" y1="16" x2="23" y2="16" />'
  ])

export const IconMinus = (props: IconProps): JSX.Element =>
  svg(props.className, ['<line x1="5" y1="12" x2="19" y2="12" />'])

export const IconClose = (props: IconProps): JSX.Element =>
  svg(props.className, ['<line x1="18" y1="6" x2="6" y2="18" />', '<line x1="6" y1="6" x2="18" y2="18" />'])

export const IconBack = (props: IconProps): JSX.Element =>
  svg(props.className, ['<line x1="19" y1="12" x2="5" y2="12" />', '<polyline points="12 19 5 12 12 5" />'])

export const IconUndo = (props: IconProps): JSX.Element =>
  svg(props.className, ['<polyline points="1 4 1 10 7 10" />', '<path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />'])

export const IconScissors = (props: IconProps): JSX.Element =>
  svg(props.className, [
    '<circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" />',
    '<line x1="20" y1="4" x2="8.12" y2="15.88" /><line x1="14.47" y1="14.48" x2="20" y2="20" /><line x1="8.12" y1="8.12" x2="12" y2="12" />'
  ])

export const IconFast = (props: IconProps): JSX.Element =>
  svg(props.className, ['<polygon points="13 19 22 12 13 5 13 19" />', '<polygon points="2 19 11 12 2 5 2 19" />'])

export const IconTrash = (props: IconProps): JSX.Element =>
  svg(props.className, [
    '<polyline points="3 6 5 6 21 6" />',
    '<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />',
    '<line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />'
  ])

export const IconExport = (props: IconProps): JSX.Element =>
  svg(props.className, [
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />',
    '<polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />'
  ])

export const IconClock = (props: IconProps): JSX.Element =>
  svg(props.className, ['<circle cx="12" cy="12" r="9" />', '<polyline points="12 7 12 12 15.5 14" />'])

export const IconVolume = (props: IconProps): JSX.Element =>
  svg(props.className, ['<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />', '<path d="M15.5 8.5a5 5 0 0 1 0 7" />'])

export const IconMic = (props: IconProps): JSX.Element =>
  svg(props.className, [
    '<rect x="9" y="2" width="6" height="12" rx="3" />',
    '<path d="M5 10v1a7 7 0 0 0 14 0v-1" /><line x1="12" y1="18" x2="12" y2="22" />'
  ])

export const IconFilm = (props: IconProps): JSX.Element =>
  svg(props.className, [
    '<rect x="2.5" y="4" width="19" height="16" rx="2" />',
    '<line x1="7" y1="4" x2="7" y2="20" /><line x1="17" y1="4" x2="17" y2="20" />',
    '<line x1="2.5" y1="9" x2="7" y2="9" /><line x1="2.5" y1="15" x2="7" y2="15" />',
    '<line x1="17" y1="9" x2="21.5" y2="9" /><line x1="17" y1="15" x2="21.5" y2="15" />'
  ])

export const IconGlobe = (props: IconProps): JSX.Element =>
  svg(props.className, [
    '<circle cx="12" cy="12" r="9" />',
    '<ellipse cx="12" cy="12" rx="4" ry="9" />',
    '<line x1="3" y1="12" x2="21" y2="12" />'
  ])
