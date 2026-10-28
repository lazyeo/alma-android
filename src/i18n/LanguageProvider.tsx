import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { localeTag, resolveLanguage, type LanguagePreference } from './core'
import {
  loadLanguagePreference,
  saveLanguagePreference,
  systemLanguages,
} from './preference'
import { getLanguage, setLanguage, t, translatorFor } from './runtime'

type LanguageContextValue = {
  preference: LanguagePreference
  language: ReturnType<typeof getLanguage>
  locale: string
  t: typeof t
  setPreference: (preference: LanguagePreference) => void
}

// Without a provider (component tests) copy follows the runtime language.
const LanguageContext = createContext<LanguageContextValue>({
  preference: 'system',
  get language() {
    return getLanguage()
  },
  get locale() {
    return localeTag(getLanguage())
  },
  t,
  setPreference: () => {},
})

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState(loadLanguagePreference)
  const [system, setSystem] = useState(systemLanguages)
  const language = resolveLanguage(preference, system)
  // Update the shared runtime before children render so non-hook copy
  // produced during this render already uses the new language.
  if (getLanguage() !== language) setLanguage(language)

  useEffect(() => {
    const change = () => setSystem(systemLanguages())
    window.addEventListener('languagechange', change)
    return () => window.removeEventListener('languagechange', change)
  }, [])

  useEffect(() => {
    document.documentElement.lang = localeTag(language)
  }, [language])

  const value = useMemo<LanguageContextValue>(
    () => ({
      preference,
      language,
      locale: localeTag(language),
      t: translatorFor(language),
      setPreference: (next) => {
        saveLanguagePreference(next)
        setPreferenceState(next)
      },
    }),
    [preference, language],
  )
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useT() {
  return useContext(LanguageContext).t
}

export function useLanguage() {
  return useContext(LanguageContext)
}
