import {
  createTranslator,
  type CatalogShape,
  type MessageTree,
  type Translator,
} from '../i18n/core'
import { getLanguage } from '../i18n/runtime'
import { useLanguage } from '../i18n'
/** Extension catalogs have their own typed keys; the core translator stays closed. */
export function createExtensionMessages<const T extends MessageTree>(catalogs: {
  en: T
  zh: CatalogShape<T>
}) {
  const translators = {
    en: createTranslator<T>(catalogs.en, 'en'),
    zh: createTranslator<T>(catalogs.zh, 'zh'),
  }
  const t: Translator<T> = (key, ...params) =>
    translators[getLanguage()](key, ...params)
  return { t, useT: () => translators[useLanguage().language] }
}
