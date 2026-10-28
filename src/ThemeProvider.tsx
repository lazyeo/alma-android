import { haptic } from './haptics'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { Check, ChevronRight, Monitor, Moon, Palette, Sun } from 'lucide-react'
import { BottomSheet } from './components/BottomSheet'
import { themes } from './themes'
import {
  defaultThemeSettings,
  loadThemeSettings,
  mapBase46ToCSS,
  saveThemeSettings,
  type ThemeSettings,
} from './theme'
import { configureNativeChrome } from './nativeBridge'
import { useT } from './i18n'
const ThemeContext = createContext({
  settings: defaultThemeSettings,
  update: (_: ThemeSettings) => {},
})
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(loadThemeSettings)
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  )
  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)')
    const change = () => setSystemDark(query.matches)
    query.addEventListener('change', change)
    return () => query.removeEventListener('change', change)
  }, [])
  useEffect(() => {
    const mode =
      settings.mode === 'system'
        ? systemDark
          ? 'dark'
          : 'light'
        : settings.mode
    const theme = themes.find((t) => t.name === settings[mode])!
    const vars = mapBase46ToCSS(theme)
    for (const [key, value] of Object.entries(vars))
      document.documentElement.style.setProperty(key, value)
    document.documentElement.style.colorScheme = mode
    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    )
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.append(meta)
    }
    meta.content = vars['--background']
    void configureNativeChrome(vars['--background'], mode === 'dark')
  }, [settings, systemDark])
  return (
    <ThemeContext.Provider
      value={{
        settings,
        update: (value) => {
          saveThemeSettings(value)
          setSettings(value)
        },
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

const titleCase = (name: string) =>
  name.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase())

export function ThemeSettingsView() {
  const { settings, update } = useContext(ThemeContext)
  const [picker, setPicker] = useState<'light' | 'dark'>()
  const t = useT()
  return (
    <>
      <section
        className="settings-section"
        aria-labelledby="appearance-heading"
      >
        <h2 id="appearance-heading" className="settings-section-title">
          {t('settings.appearance.title')}
        </h2>
        <div className="settings-group">
          <div className="settings-row appearance-row">
            <span className="settings-icon">
              <Palette size={17} />
            </span>
            <span className="settings-copy">
              <strong>{t('settings.appearance.title')}</strong>
            </span>
            <div
              className="appearance-segments"
              aria-label={t('settings.appearance.mode')}
            >
              {(
                [
                  ['system', Monitor],
                  ['light', Sun],
                  ['dark', Moon],
                ] as const
              ).map(([mode, Icon]) => (
                <button
                  key={mode}
                  aria-label={t(`settings.appearance.modes.${mode}`)}
                  aria-pressed={settings.mode === mode}
                  onClick={() => {
                    void haptic('selection')
                    update({ ...settings, mode })
                  }}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
          </div>
          {(['dark', 'light'] as const).map((mode) => (
            <button
              className="settings-row settings-row-button"
              key={mode}
              onClick={() => {
                void haptic('selection')
                setPicker(mode)
              }}
            >
              <span className="settings-icon">
                {mode === 'dark' ? <Moon size={17} /> : <Sun size={17} />}
              </span>
              <span className="settings-copy">
                <strong>{t(`settings.appearance.theme.${mode}`)}</strong>
                <small>{titleCase(settings[mode])}</small>
              </span>
              <ChevronRight className="settings-chevron" size={16} />
            </button>
          ))}
        </div>
      </section>
      {picker ? (
        <BottomSheet
          title={t(`settings.appearance.theme.${picker}`)}
          label={t(`settings.appearance.chooseTheme.${picker}`)}
          className="theme-picker-sheet"
          onClose={() => setPicker(undefined)}
        >
          <div className="theme-list">
            {themes
              .filter((theme) => theme.type === picker)
              .map((theme) => (
                <button
                  className="theme-list-row"
                  key={theme.name}
                  aria-pressed={settings[picker] === theme.name}
                  onClick={() => {
                    void haptic('selection')
                    update({ ...settings, [picker]: theme.name })
                    setPicker(undefined)
                  }}
                >
                  <span className="theme-strip" aria-hidden="true">
                    <i style={{ background: theme.base_30.black }} />
                    <i style={{ background: theme.base_30.blue }} />
                    <i style={{ background: theme.base_30.green }} />
                    <i style={{ background: theme.base_30.white }} />
                  </span>
                  <span>{titleCase(theme.name)}</span>
                  {settings[picker] === theme.name ? <Check size={18} /> : null}
                </button>
              ))}
          </div>
        </BottomSheet>
      ) : null}
    </>
  )
}
