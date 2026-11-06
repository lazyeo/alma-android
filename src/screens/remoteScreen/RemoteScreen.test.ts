import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  new URL('./RemoteScreen.tsx', import.meta.url),
  'utf8',
)

describe('RemoteScreen desktop switching', () => {
  it('renders the shared desktop switcher in the header', () => {
    expect(source).toMatch(
      /import \{\s*DesktopSwitcher,\s*DesktopTransportIndicator,\s*\} from '\.\.\/\.\.\/desktops\/DesktopSwitcher'/,
    )
    expect(source).toMatch(
      /<DesktopSwitcher\s+className="desktop-title-switcher remote-screen-desktop-switcher"\s+variant="title"\s+\/>/,
    )
    expect(source).toContain(
      '<DesktopTransportIndicator className="remote-screen-latency" />',
    )
  })
})

describe('RemoteScreen input surfaces', () => {
  it('takes every gesture on the screen itself, with no separate pad', () => {
    expect(source).not.toContain('remote-trackpad')
    expect(source).toContain('{...screenPointerHandlers}')
    expect(source).toMatch(
      /data-sidebar-swipe-exclude=\{remote\.control \|\| zoomed/,
    )
  })

  it('draws a local cursor while in control and hides the Mac one', () => {
    expect(source).toMatch(/\{trackpad \? \(\s*<div\s+ref=\{cursorRef\}/)
    expect(source).toContain(
      "remote.send({ type: 'mouse_mode', on: trackpad })",
    )
  })

  it('renders zoom and pan with transforms only, outside React renders', () => {
    // The zoom state lives in the hook shared with the browser view.
    const zoomSource = readFileSync(
      new URL('../liveStream/useStreamZoom.ts', import.meta.url),
      'utf8',
    )
    expect(source).toContain('useStreamZoom({')
    expect(zoomSource).toContain(
      'layerRef.current.style.transform = viewTransform(view)',
    )
    expect(source).not.toMatch(/style=\{\{\s*transform/)
  })

  it('moves the cursor through the view and acts only at the cursor', () => {
    expect(source).toContain('surfaceDeltaToDesktop(')
    expect(source).toContain('pointerAt(action, cursor.current)')
    expect(source).not.toContain('surfaceToDesktop(')
    expect(source).not.toContain('mapClientPoint')
  })
})
