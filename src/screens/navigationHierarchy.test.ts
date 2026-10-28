import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
const app = read('../App.tsx')
const shell = read('../layout/AppShell.tsx')
const threads = read('./ThreadsScreen.tsx')
const styles = read('../styles.css')
const capture = read('../../scripts/screenshots/capture.mjs')

describe('hierarchy and navigation', () => {
  it('removes Inbox navigation and keeps a legacy redirect', () => {
    expect(shell).not.toContain("label: 'Inbox'")
    expect(shell).not.toContain("{ to: '/inbox'")
    expect(app).not.toContain('InboxScreen')
    expect(app).toContain('path="inbox" element={<ActiveRedirect />}')
  })

  it('uses the response mark ahead of unread in both thread list variants', () => {
    expect(threads).toContain("aria-label={t('threads.row.needsResponse')}")
    expect(threads).toContain('className="response-dot"')
    expect(threads).toContain('pendingThreadIds.has(thread.id)')
    expect(styles).toMatch(
      /\.response-dot \{[^}]*background: var\(--amber-9\);/s,
    )
  })

  it('captures grouped projects, response state, navigation, and crew states', () => {
    for (const file of [
      'navigation-hierarchy-project-group-phone.png',
      'navigation-hierarchy-project-group-two-pane.png',
      'navigation-hierarchy-navigation-phone.png',
      'navigation-hierarchy-navigation-two-pane.png',
      'navigation-hierarchy-response-thread.png',
      'navigation-hierarchy-crew-idle.png',
      'navigation-hierarchy-crew-running.png',
    ])
      expect(capture).toContain(`'${file}'`)
  })
})
