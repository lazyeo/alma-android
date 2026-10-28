import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
const thread = read('./ThreadScreen.tsx')
const threads = read('./ThreadsScreen.tsx')
const switcher = read('../desktops/DesktopSwitcher.tsx')
const styles = read('../styles.css')
const capture = read('../../scripts/screenshots/capture.mjs')

describe('anchored actions', () => {
  it('removes Outputs & Sources from the thread header and uses Workflow for Crew', () => {
    expect(thread).not.toContain('Outputs & Sources')
    expect(thread).not.toContain('Outputs and sources')
    expect(thread).not.toContain('aggregateThreadResources')
    expect(thread).toContain('<Network size={17}')
    expect(thread).toContain('className="crew-running-dot"')
  })

  it('uses AnchoredMenu for thread, desktop, project, and row actions', () => {
    expect(thread).toContain('<AnchoredMenu')
    expect(thread).toContain("aria-label={t('thread.menu.label')}")
    expect(thread).toContain("aria-label={t('thread.switchProjectFor', {")
    expect(switcher).toContain('<AnchoredMenu')
    expect(threads).toContain('<AnchoredMenu')
  })
})

describe('continuous split surfaces', () => {
  it('gives both split columns explicit continuous backgrounds', () => {
    // The sidebar sits one surface step from the main pane.
    expect(styles).toMatch(
      /\.split-sidebar\s*\{[^}]*background: var\(--sidebar\);/s,
    )
    expect(styles).not.toMatch(
      /\.split-sidebar\s*\{[^}]*background: var\(--background\);/s,
    )
    expect(styles).toMatch(
      /\.split-main\s*\{[^}]*background: var\(--background\);/s,
    )
    expect(styles).toMatch(
      /\.split-sidebar \.thread-tabs,[\s\S]*\.split-sidebar \.threads-page-body\s*\{[^}]*background: inherit;/,
    )
  })

  it('captures anchored menus and all requested two-pane themes', () => {
    for (const file of [
      'anchored-menus-thread-menu.png',
      'anchored-menus-desktop-menu.png',
      'anchored-menus-row-menu.png',
      'anchored-menus-thread-header.png',
      'anchored-menus-palenight-threads.png',
      'anchored-menus-chocolate-projects-scrolled.png',
      'anchored-menus-light-navigation.png',
      'anchored-menus-palenight-settings-scrolled.png',
      'anchored-menus-light-crystals.png',
    ])
      expect(capture).toContain(`'${file}'`)
  })
})
