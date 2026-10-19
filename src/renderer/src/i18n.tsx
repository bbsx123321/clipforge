import type { JSX } from 'react'
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { translator, type Lang, type Translator } from '../../shared/strings'

/**
 * 界面语言上下文：语言真源在主进程（config.json 持久化），
 * 这里持有镜像状态：初始拉取 + 订阅广播（任意窗口切换语言，全窗口即时生效）。
 */

/** 上下文值：语言 + 绑定语言的翻译函数 + 切换函数 */
type I18nContextValue = {
  readonly lang: Lang
  readonly t: Translator
  readonly setLang: (lang: Lang) => void
}

const I18nContext = createContext<I18nContextValue | undefined>(undefined)

/** 语言提供者：包裹全部视图（控制条与各覆盖层窗口共用同一入口） */
export const I18nProvider = (props: { readonly children: JSX.Element }): JSX.Element => {
  const [lang, setLangState] = useState<Lang>('zh')

  // 初始拉取持久化语言
  useEffect(() => {
    void window.api.getLanguage().then(setLangState)
  }, [])

  // 订阅语言广播（其他窗口切换时同步）
  useEffect(() => window.api.onLanguageChanged(setLangState), [])

  // 切换语言：持久化由主进程完成，广播回传后更新本地状态
  const setLang = useCallback((next: Lang): void => {
    void window.api.setLanguage(next).then(setLangState)
  }, [])

  const value: I18nContextValue = useMemo(
    () => ({ lang, t: translator(lang), setLang }),
    [lang, setLang]
  )

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>
}

/** 取翻译上下文（组件内文案统一走 t('key')；未挂 Provider 时直接抛错暴露问题） */
export const useT = (): I18nContextValue => {
  const value = useContext(I18nContext)
  if (value === undefined) {
    throw new Error('useT 必须在 I18nProvider 内使用')
  }
  return value
}
