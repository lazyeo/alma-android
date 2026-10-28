import { expect, it } from 'vitest'
import { themes } from './themes'
import {
  mapBase46ToCSS,
  loadThemeSettings,
  saveThemeSettings,
  defaultThemeSettings,
} from './theme'
it('contains 74 base46 palettes with only portable fields', () => {
  expect(themes).toHaveLength(74)
  for (const t of themes)
    expect(Object.keys(t).sort()).toEqual(['base_30', 'name', 'type'])
})
it('maps semantic roles to the same scale steps in dark and light themes', () => {
  for (const theme of themes) {
    const tokens = mapBase46ToCSS(theme)
    for (const [alias, step] of Object.entries({
      background: 'gray-1',
      foreground: 'gray-12',
      card: 'gray-2',
      popover: 'gray-2',
      'muted-foreground': 'gray-11',
      border: 'gray-7',
      ring: 'accent-8',
      primary: 'accent-9',
      'primary-foreground': 'accent-contrast',
      accent: 'accent-3',
      'accent-foreground': 'accent-11',
      destructive: 'red-11',
      'chat-user-bg': 'gray-3',
    }))
      expect(tokens[`--${alias}`], `${theme.name}: ${alias}`).toBe(
        tokens[`--${step}`],
      )
  }
})
it('keeps every sidebar surface perceptibly distinct with readable text', () => {
  for (const theme of themes) {
    const tokens = mapBase46ToCSS(theme)
    expect(tokens['--sidebar'], theme.name).not.toBe(tokens['--background'])
  }
})
it('removes floating shadows in dark themes and keeps light shadows', () => {
  for (const theme of themes) {
    const tokens = mapBase46ToCSS(theme)
    if (theme.type === 'dark') {
      expect(tokens['--shadow-popover'], theme.name).toBe('none')
      expect(tokens['--shadow-sheet'], theme.name).toBe('none')
      expect(tokens['--sheet-edge'], theme.name).toBe(tokens['--gray-7'])
    } else {
      expect(tokens['--shadow-popover'], theme.name).toBe(
        '0 8px 24px #00000026',
      )
      expect(tokens['--shadow-sheet'], theme.name).toBe(
        '0 -12px 48px #00000033',
      )
      expect(tokens['--sheet-edge'], theme.name).toBe('transparent')
    }
  }
})
it('keeps dark popovers visibly separate from the background', () => {
  for (const theme of themes.filter((candidate) => candidate.type === 'dark')) {
    const tokens = mapBase46ToCSS(theme)
    expect(tokens['--popover'], theme.name).not.toBe(tokens['--background'])
  }
})
it('persists local choices and recovers invalid data', () => {
  let value: string | null = null
  const storage = {
    getItem: () => value,
    setItem: (_: string, v: string) => {
      value = v
    },
  }
  expect(loadThemeSettings(storage)).toEqual(defaultThemeSettings)
  saveThemeSettings({ ...defaultThemeSettings, mode: 'light' }, storage)
  expect(loadThemeSettings(storage).mode).toBe('light')
  value = '{bad'
  expect(loadThemeSettings(storage)).toEqual(defaultThemeSettings)
  value = JSON.stringify({
    mode: 'unknown',
    dark: 'one_light',
    light: 'missing',
  })
  expect(loadThemeSettings(storage)).toEqual(defaultThemeSettings)
})
