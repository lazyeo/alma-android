import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  defaultFoldTransitionSettings,
  foldTransitionNativeConfig,
} from './foldTransition'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
const settings = read('./screens/SettingsScreen.tsx')
const main = read('./main.tsx')
const java = (name: string) =>
  read(`../android/app/src/main/java/club/a_dobe/alma/${name}.java`)

describe('Fold transition settings section', () => {
  it('reuses the existing Settings primitives', () => {
    expect(settings).toContain("t('settings.fold.title')")
    expect(settings).toMatch(
      /<SettingsRow[\s\S]*?title=\{t\('settings\.fold\.title'\)\}/,
    )
    expect(settings).not.toMatch(/[折叠轻标准强度生效调试预览默认无法]/)
    expect(settings.match(/function Switch\(/g)).toHaveLength(1)
    expect(settings).toContain('<BottomSheet')
    expect(settings).toContain("(['open', 'close'] as const)")
    expect(settings).toContain('previewNativeFoldTransition(direction)')
    expect(settings).toContain("title={t('settings.fold.side.title')}")
  })

  it('pushes saved settings to native on startup and on change', () => {
    expect(main).toContain('loadFoldTransitionSettings()')
    expect(main).toContain('configureNativeFoldTransition')
    expect(settings).toContain('saveFoldTransitionSettings')
    expect(settings).toContain('configureNativeFoldTransition')
  })
})

describe('FoldTransition native plugin', () => {
  it('is registered before the bridge starts', () => {
    const activity = java('MainActivity')
    const register = activity.indexOf(
      'registerPlugin(FoldTransitionPlugin.class)',
    )
    expect(register).toBeGreaterThan(-1)
    expect(register).toBeLessThan(
      activity.indexOf('super.onCreate(savedInstanceState)'),
    )
    expect(java('FoldTransitionPlugin')).toContain(
      '@CapacitorPlugin(name = "FoldTransition")',
    )
  })

  it('stops sensors and the frame loop when backgrounded', () => {
    const plugin = java('FoldTransitionPlugin')
    const background = plugin.slice(
      plugin.indexOf('private void onBackground()'),
      plugin.indexOf('private void updateListening()'),
    )
    expect(background).toContain('stopListening()')
    expect(background).toContain('removeFrameCallback(frameCallback)')
    expect(background).toContain('clearEffect()')
  })

  it('accepts every tuning key the web app sends', () => {
    const plugin = java('FoldTransitionPlugin')
    for (const key of Object.keys(
      foldTransitionNativeConfig(defaultFoldTransitionSettings),
    ))
      expect(plugin).toContain(`"${key}"`)
  })
})
