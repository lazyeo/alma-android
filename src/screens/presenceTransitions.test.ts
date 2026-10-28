import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
const thread = read('./ThreadScreen.tsx')
const threads = read('./ThreadsScreen.tsx')
const activity = read('./GenerationActivityBar.tsx')
const presence = read('../components/usePresence.ts')
const styles = read('../styles.css')
const capture = read('../../scripts/screenshots/capture.mjs')

describe('conditional transitions', () => {
  it('keeps short-lived conditional surfaces mounted for their exit animation', () => {
    expect(presence).toContain("phase: 'entering' | 'entered' | 'exiting'")
    expect(thread).toContain('usePresence(scrolledUp)')
    expect(thread).toContain('usePresence(Boolean(error))')
    expect(thread).toContain('usePresence(Boolean(recipe))')
    expect(thread).toContain('usePresence(queuedMessages.length > 0)')
    expect(activity).toContain('usePresence(visible)')
    expect(threads).toContain('usePresence(Boolean(error))')
  })

  it('defines focused enter and exit motion with a reduced-motion override', () => {
    expect(styles).toContain('.ui-presence.entering')
    expect(styles).toContain('.ui-presence.exiting')
    expect(styles).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.ui-presence/s,
    )
    expect(styles).toContain('.thread-tab-content')
  })
})

describe('tab indicator captures', () => {
  it('asserts both selected tabs at phone and two-pane sizes', () => {
    expect(capture).toContain('async function assertTabIndicatorGeometry(')
    for (const file of [
      'tab-indicator-phone-threads.png',
      'tab-indicator-phone-projects.png',
      'tab-indicator-two-pane-threads.png',
      'tab-indicator-two-pane-projects.png',
    ]) {
      const start = capture.indexOf(`file: '${file}'`)
      expect(start).toBeGreaterThan(-1)
      const next = capture.indexOf('\n  {', start + 1)
      const shot = capture.slice(start, next < 0 ? undefined : next)
      expect(shot).toContain('assertTabIndicatorGeometry(page')
    }
  })
})

describe('project accordion capture', () => {
  it('asserts selected project-row geometry inside the expanded accordion', () => {
    const shot = capture.slice(
      capture.indexOf("file: 'list-chrome-phone-projects-accordion.png'"),
      capture.indexOf("file: 'phone-goal-recipe-banner.png'"),
    )
    expect(shot).toContain("classList.add('selected')")
    expect(shot).toContain("'.project-thread-row.selected'")
    expect(shot).toContain("'.threads-page-body'")
  })
})

describe('animated overlay captures', () => {
  it('honors each scenario reduced-motion setting', () => {
    expect(capture).toContain("reducedMotion: shot.reducedMotion ?? 'reduce'")
  })

  it.each([
    ['thread menu', 'overlays-thread-menu-open.png'],
    ['desktop switcher', 'overlays-desktop-switcher-open.png'],
    ['project switcher', 'overlays-project-switcher-open.png'],
    ['row long-press menu', 'overlays-row-menu-open.png'],
  ])('opens the %s before capture', (_name, file) => {
    const start = capture.indexOf(`file: '${file}'`)
    expect(start).toBeGreaterThan(-1)
    const next = capture.indexOf('\n  {', start + 1)
    const shot = capture.slice(start, next < 0 ? undefined : next)
    expect(shot).toContain("getByRole('menu'")
    expect(shot).toContain('getComputedStyle(node).visibility')
    expect(shot).toContain("'visible'")
  })
})
