import { parseLanguagePreference, type LanguagePreference } from './core'

export const LANGUAGE_STORAGE_KEY = 'alma-mobile-language-v1'

export function loadLanguagePreference(): LanguagePreference {
  try {
    return parseLanguagePreference(
      globalThis.localStorage?.getItem(LANGUAGE_STORAGE_KEY),
    )
  } catch {
    // Storage can be unavailable (private mode, sandboxed WebView).
    return 'system'
  }
}

export function saveLanguagePreference(preference: LanguagePreference) {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, preference)
}

export function systemLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return []
  if (navigator.languages?.length) return navigator.languages
  return navigator.language ? [navigator.language] : []
}
