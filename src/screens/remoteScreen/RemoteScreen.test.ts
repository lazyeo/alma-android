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
