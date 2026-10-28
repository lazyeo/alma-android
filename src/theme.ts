import { themes, type Base46Theme } from './themes'

type OKLCH = [number, number, number]
const linear = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
function channels(hex: string) {
  return [1, 3, 5].map((i) => linear(parseInt(hex.slice(i, i + 2), 16) / 255))
}
function luminance(hex: string) {
  const [r, g, b] = channels(hex)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
function toOKLCH(hex: string): OKLCH {
  const [r, g, b] = channels(hex)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    Math.hypot(a, bb),
    Math.atan2(bb, a),
  ]
}
// Reduce chroma at fixed lightness/hue to fit sRGB; never clip hue channels.
function fromOKLCH([lightness, chroma, hue]: OKLCH) {
  const rgb = (c: number) => {
    const a = c * Math.cos(hue),
      b = c * Math.sin(hue)
    const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3
    const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3
    const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ]
  }
  let low = 0,
    high = chroma
  if (rgb(chroma).every((v) => v >= 0 && v <= 1)) low = chroma
  for (let i = 0; low < high && i < 24; i++) {
    const mid = (low + high) / 2
    if (rgb(mid).every((v) => v >= -1e-7 && v <= 1.0000001)) low = mid
    else high = mid
  }
  return (
    '#' +
    rgb(low)
      .map((v) => {
        const clamped = Math.max(0, Math.min(1, v))
        const encoded =
          clamped <= 0.0031308
            ? 12.92 * clamped
            : 1.055 * clamped ** (1 / 2.4) - 0.055
        return Math.round(encoded * 255)
          .toString(16)
          .padStart(2, '0')
      })
      .join('')
  )
}
function mix(a: string, b: string, amount: number) {
  const x = toOKLCH(a),
    y = toOKLCH(b)
  // Achromatic endpoints have no meaningful hue; borrow the colored endpoint.
  if (x[1] < 0.0001) x[2] = y[2]
  if (y[1] < 0.0001) y[2] = x[2]
  const hueDelta = Math.atan2(Math.sin(y[2] - x[2]), Math.cos(y[2] - x[2]))
  return fromOKLCH([
    x[0] + (y[0] - x[0]) * amount,
    x[1] + (y[1] - x[1]) * amount,
    x[2] + hueDelta * amount,
  ])
}
function readable(color: string, backgrounds: string[], ratio: number) {
  if (backgrounds.every((bg) => contrast(color, bg) >= ratio)) return color
  const [l, c, h] = toOKLCH(color)
  const end =
    contrast('#000000', backgrounds[0]) > contrast('#ffffff', backgrounds[0])
      ? 0
      : 1
  // Keep a verified passing endpoint while bisecting toward the original.
  // Contrast is evaluated after quantization, so rounding cannot break it.
  let low = 0,
    high = 1
  let result = end === 0 ? '#000000' : '#ffffff'
  for (let i = 0; i < 24; i++) {
    const amount = (low + high) / 2
    const candidate = fromOKLCH([l + (end - l) * amount, c, h])
    if (backgrounds.every((bg) => contrast(candidate, bg) >= ratio)) {
      high = amount
      result = candidate
    } else low = amount
  }
  return result
}
export function mapBase46ToCSS(theme: Base46Theme): Record<string, string> {
  const p = theme.base_30
  const background = theme.type === 'light' ? p.black : p.one_bg
  const tokens: Record<string, string> = {}
  // Steps 1–2 surfaces, 3–5 states, 6–8 borders, 9–10 fills, 11–12 text.
  const grayAmounts =
    theme.type === 'light'
      ? [0, 0.018, 0.045, 0.075, 0.11, 0.16, 0.22, 0.31, 0.43, 0.54, 0.7, 1]
      : [0, 0.03, 0.07, 0.11, 0.16, 0.22, 0.29, 0.38, 0.5, 0.6, 0.76, 1]
  grayAmounts.forEach((amount, i) => {
    tokens[`--gray-${i + 1}`] = mix(background, p.white, amount)
  })
  tokens['--gray-1'] = background
  tokens['--gray-12'] = readable(p.white, [tokens['--gray-2']], 4.5)
  const sidebarSeed = p.darker_black
  const sidebarDelta = Math.abs(
    toOKLCH(sidebarSeed)[0] - toOKLCH(background)[0],
  )
  tokens['--sidebar-surface'] =
    sidebarDelta >= 0.015 ? sidebarSeed : tokens['--gray-2']
  tokens['--gray-11'] = readable(
    tokens['--gray-11'],
    [background, tokens['--gray-2']],
    4.5,
  )
  for (const [name, seed] of Object.entries({
    accent: p.blue,
    red: p.red,
    amber: p.yellow,
    green: p.green,
  })) {
    const amounts =
      theme.type === 'light'
        ? [0.012, 0.03, 0.075, 0.13, 0.2, 0.29, 0.4, 0.57, 1, 0.88]
        : [0.02, 0.045, 0.1, 0.17, 0.25, 0.35, 0.47, 0.63, 1, 0.91]
    amounts.forEach((amount, i) => {
      tokens[`--${name}-${i + 1}`] = mix(background, seed, amount)
    })
    tokens[`--${name}-9`] = seed
    tokens[`--${name}-11`] = readable(
      seed,
      [background, tokens['--gray-2']],
      4.5,
    )
    tokens[`--${name}-12`] = readable(
      mix(seed, p.white, 0.8),
      [background, tokens['--gray-2']],
      7,
    )
    tokens[`--${name}-contrast`] =
      contrast('#000000', seed) >= contrast('#ffffff', seed)
        ? '#000000'
        : '#ffffff'
  }
  const aliases: Record<string, string> = {
    background: 'gray-1',
    foreground: 'gray-12',
    card: 'gray-2',
    'card-foreground': 'gray-12',
    popover: 'gray-2',
    'popover-foreground': 'gray-12',
    primary: 'accent-9',
    'primary-foreground': 'accent-contrast',
    secondary: 'gray-3',
    'secondary-foreground': 'gray-12',
    muted: 'gray-3',
    'muted-foreground': 'gray-11',
    accent: 'accent-3',
    'accent-foreground': 'accent-11',
    destructive: 'red-11',
    'destructive-foreground': 'red-contrast',
    border: 'gray-7',
    input: 'gray-3',
    ring: 'accent-8',
    sidebar: 'sidebar-surface',
    'sidebar-foreground': 'gray-12',
    'sidebar-primary': 'accent-9',
    'sidebar-primary-foreground': 'accent-contrast',
    'sidebar-accent': 'accent-3',
    'sidebar-accent-foreground': 'accent-11',
    'sidebar-border': 'gray-7',
    'sidebar-ring': 'accent-8',
    'chat-user-bg': 'gray-3',
    'chat-user-foreground': 'gray-12',
    'chart-1': 'accent-9',
    'chart-3': 'amber-9',
    'chart-4': 'green-9',
    'chart-5': 'red-9',
  }
  for (const [alias, step] of Object.entries(aliases))
    tokens[`--${alias}`] = tokens[`--${step}`]
  tokens['--chart-2'] = p.purple
  tokens['--overlay-backdrop'] = '#00000066'
  tokens['--shadow-popover'] =
    theme.type === 'dark' ? 'none' : '0 8px 24px #00000026'
  tokens['--shadow-sheet'] =
    theme.type === 'dark' ? 'none' : '0 -12px 48px #00000033'
  tokens['--sheet-edge'] =
    theme.type === 'dark' ? tokens['--gray-7'] : 'transparent'
  return tokens
}
export interface ThemeSettings {
  mode: 'system' | 'light' | 'dark'
  dark: string
  light: string
}
export const defaultThemeSettings: ThemeSettings = {
  mode: 'system',
  dark: 'palenight',
  light: 'one_light',
}
const key = 'alma-mobile.theme.v1'
export function loadThemeSettings(
  storage: Pick<Storage, 'getItem'> = localStorage,
): ThemeSettings {
  try {
    const value = JSON.parse(storage.getItem(key) ?? '{}')
    return {
      mode: ['system', 'dark', 'light'].includes(value.mode)
        ? value.mode
        : 'system',
      dark: themes.some((t) => t.name === value.dark && t.type === 'dark')
        ? value.dark
        : 'palenight',
      light: themes.some((t) => t.name === value.light && t.type === 'light')
        ? value.light
        : 'one_light',
    }
  } catch {
    return { ...defaultThemeSettings }
  }
}
export function saveThemeSettings(
  value: ThemeSettings,
  storage: Pick<Storage, 'setItem'> = localStorage,
) {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    /* Session choice still applies when storage is unavailable. */
  }
}
