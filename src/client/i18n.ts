/**
 * dsh-manim surface copy lookup (mirrors the i18n helper dsh-ppt and dsh-drawio
 * use).
 *
 * @module dsh-manim/client/i18n
 */

import { EN, ZH } from './locales.ts'

export type ManimLang = 'zh' | 'en'

export type ManimKey = keyof typeof ZH

const DICTS: Record<ManimLang, Record<ManimKey, string>> = { zh: ZH, en: EN }

/** The current UI language (document lang, `zh` unless the shell says English). */
export function currentLang(): ManimLang {
  return typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : 'zh'
}

/** Look up one copy string, substituting `{placeholders}`. */
export function lookup(lang: ManimLang, key: ManimKey, params: Record<string, string | number> = {}): string {
  let text: string = DICTS[lang][key] ?? DICTS.zh[key] ?? key
  for (const [name, value] of Object.entries(params)) {
    text = text.replaceAll(`{${name}}`, String(value))
  }
  return text
}

/** Look up in the current UI language. */
export function t(key: ManimKey, params: Record<string, string | number> = {}): string {
  return lookup(currentLang(), key, params)
}

/** Format a duration in seconds as a compact localized string. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return t('time.unknown')
  }
  if (seconds < 60) return t('time.seconds', { value: seconds.toFixed(1) })
  const minutes = Math.floor(seconds / 60)
  const rest = Math.round(seconds - minutes * 60)
  if (rest === 0) return t('time.minutes', { value: minutes })
  return t('time.minutesSeconds', { minutes, seconds: rest })
}
