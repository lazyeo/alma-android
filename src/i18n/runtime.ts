import {
  createTranslator,
  localeTag,
  resolveLanguage,
  type Language,
  type Translator,
} from './core'
import { en, type Messages } from './en'
import { loadLanguagePreference, systemLanguages } from './preference'
import { zh } from './zh'

// The active language for code outside React (notifications, pure copy
// helpers). LanguageProvider is the only writer, so React and non-React copy
// never disagree.
const translators: Record<Language, Translator<Messages>> = {
  en: createTranslator<Messages>(en, 'en'),
  zh: createTranslator<Messages>(zh, 'zh'),
}

let current: Language = resolveLanguage(
  loadLanguagePreference(),
  systemLanguages(),
)

export function getLanguage() {
  return current
}

export function setLanguage(language: Language) {
  current = language
}

/** BCP 47 tag for `Intl` formatters and `<html lang>`. */
export function currentLocale() {
  return localeTag(current)
}

export function translatorFor(language: Language) {
  return translators[language]
}

/** Non-hook translator; inside components prefer `useT()` so text re-renders. */
export const t: Translator<Messages> = (key, ...params) =>
  translators[current](key, ...params)
