import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('./RemoteScreen.tsx', import.meta.url),
  'utf8',
)

describe('RemoteScreen desktop switching', () => {
  it('renders the shared desktop switcher in the header', () => {
    expect(source).toContain(
      "import { DesktopSwitcher } from '../../desktops/DesktopSwitcher'",
    )
    expect(source).toContain(
      '<DesktopSwitcher className="remote-screen-desktop-switcher" />',
    )
  })
})

describe('RemoteScreen input surfaces', () => {
  it('renders a dedicated trackpad only in trackpad mode', () => {
    expect(source).toContain("inputMode === 'trackpad' ? (")
    expect(source).toContain('className="remote-trackpad"')
    expect(source).toContain('data-sidebar-swipe-exclude')
    expect(source).toContain("{t('screen.trackpad')}")
  })

  it('keeps pointer handlers on the screen only in direct mode', () => {
    expect(source).toContain("inputMode === 'direct' ? screenPointerHandlers : {}")
  })
})
