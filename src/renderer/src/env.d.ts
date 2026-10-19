/// <reference types="vite/client" />

import type { RecordingApi } from '../../shared/api'

/** preload 注入的 window.api 类型声明 */
declare global {
  interface Window {
    readonly api: RecordingApi
  }
}

export {}
