import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/global.css'
import { App } from './App'
import { I18nProvider } from './i18n'
import { CountdownOverlay } from './components/CountdownOverlay'
import { OverlayPicker } from './components/OverlayPicker'
import { RegionFrameOverlay } from './components/RegionFrameOverlay'
import { WindowPickerOverlay } from './components/WindowPickerOverlay'

const container = document.getElementById('root')
if (container === null) {
  throw new Error('缺少 #root 挂载点')
}

// 同一页面承载五种视图：悬浮条控制窗口（默认）、区域选区覆盖层（#/overlay）、
// 倒计时覆盖层（#/countdown）、录制区域红色描边（#/region-frame）、窗口捕获选择（#/window）
const hash: string = window.location.hash
const view = hash.startsWith('#/overlay')
  ? <OverlayPicker />
  : hash.startsWith('#/countdown')
    ? <CountdownOverlay />
    : hash.startsWith('#/region-frame')
      ? <RegionFrameOverlay />
      : hash.startsWith('#/window')
        ? <WindowPickerOverlay />
        : <App />

// 语言提供者包裹全部视图（覆盖层文案同样跟随语言切换）
createRoot(container).render(
  <StrictMode>
    <I18nProvider>{view}</I18nProvider>
  </StrictMode>
)
