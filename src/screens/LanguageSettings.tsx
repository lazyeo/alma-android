import { Check, ChevronRight, Languages } from 'lucide-react'
import { useState } from 'react'
import { BottomSheet } from '../components/BottomSheet'
import { SettingsRow } from '../components/SettingsRow'
import { haptic } from '../haptics'
import {
  LANGUAGE_NAMES,
  LANGUAGES,
  useLanguage,
  type LanguagePreference,
} from '../i18n'
import { resolveLanguage } from '../i18n/core'
import { systemLanguages } from '../i18n/preference'

export function LanguageSettings() {
  const { preference, setPreference, t } = useLanguage()
  const [open, setOpen] = useState(false)
  const label = (value: LanguagePreference) =>
    value === 'system' ? t('common.systemDefault') : LANGUAGE_NAMES[value]
  const systemLanguage =
    LANGUAGE_NAMES[resolveLanguage('system', systemLanguages())]
  const choices: LanguagePreference[] = ['system', ...LANGUAGES]
  return (
    <section className="settings-section" aria-labelledby="language-heading">
      <h2 id="language-heading" className="settings-section-title">
        {t('settings.language.title')}
      </h2>
      <div className="settings-group">
        <SettingsRow
          icon={<Languages size={17} />}
          title={t('settings.language.title')}
          onClick={() => {
            void haptic('selection')
            setOpen(true)
          }}
          trailing={
            <span className="desktop-row-trailing">
              <span className="settings-value">{label(preference)}</span>
              <ChevronRight className="settings-chevron" size={16} />
            </span>
          }
        />
      </div>
      {open ? (
        <BottomSheet
          title={t('settings.language.title')}
          onClose={() => setOpen(false)}
        >
          <div className="sheet-list">
            {choices.map((value) => {
              const selected = preference === value
              return (
                <button
                  key={value}
                  className={`sheet-row${selected ? ' selected' : ''}`}
                  aria-pressed={selected}
                  // Autonyms are announced in their own language.
                  lang={
                    value === 'system'
                      ? undefined
                      : value === 'zh'
                        ? 'zh-CN'
                        : 'en'
                  }
                  onClick={() => {
                    void haptic('selection')
                    setPreference(value)
                    setOpen(false)
                  }}
                >
                  <span className="sheet-row-copy">
                    <span>{label(value)}</span>
                    {value === 'system' ? (
                      <small>
                        {t('settings.language.systemCurrent', {
                          language: systemLanguage,
                        })}
                      </small>
                    ) : null}
                  </span>
                  {selected ? (
                    <Check className="sheet-row-check" size={18} />
                  ) : null}
                </button>
              )
            })}
          </div>
        </BottomSheet>
      ) : null}
    </section>
  )
}
