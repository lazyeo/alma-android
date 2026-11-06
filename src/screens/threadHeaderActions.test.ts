import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
  new URL('./ThreadScreen.tsx', import.meta.url),
  'utf8',
)
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')

describe('thread header actions', () => {
  it('uses one transparent 32px action system without count badges', () => {
    // Crew, the computer browser Alma is using, and the menu.
    expect(source.match(/className="header-action-button"/g)).toHaveLength(3)
    expect(source).not.toContain('header-action-badge')
    expect(source).toContain('<Network size={17}')
    expect(source).toContain('<Globe size={17}')
    expect(source).toContain('className="crew-running-dot"')
    expect(source).not.toContain('crew-tree-icon')
    expect(source).not.toContain('crew-tree-child')
    expect(styles).toMatch(
      /\.header-action-button,\s*\.detail-actions \.header-action-button \{[^}]*width: 32px;[^}]*height: 32px;[^}]*overflow: visible;[^}]*background: transparent;/s,
    )
    expect(styles).not.toContain('.header-action-button::before')
    expect(styles).toMatch(
      /\.header-action-button:active:not\(:disabled\) \{[^}]*background: var\(--gray-3\);/s,
    )
    expect(styles).not.toContain('.header-action-badge')
    expect(styles).toMatch(
      /\.crew-running-dot \{[^}]*background: var\(--accent-9\);/s,
    )
    expect(styles).not.toContain('crew-child-one')
    expect(styles).not.toContain('crew-child-two')
    expect(styles).not.toContain('--dur-crew')
  })

  it('keeps title and actions on one resilient row', () => {
    expect(styles).toMatch(
      /\.thread-heading \{[^}]*flex: 1 1 auto;[^}]*min-width: 0;/s,
    )
    expect(styles).toMatch(
      /\.detail-actions \{[^}]*flex: 0 0 auto;[^}]*gap: 6px;/s,
    )
  })

  it('offers the computer browser only where the desktop has one', () => {
    // The menu entry needs a desktop that answered the browser status and a
    // thread in a project; the header shortcut needs a browser open for it.
    expect(source).toMatch(
      /\.\.\.\(browser\.supported && browserKey\s*\?\s*\[\s*\{\s*key: 'browser',\s*label: t\('browser\.menu'\),/s,
    )
    expect(source).toMatch(
      /\{browser\.active \? \(\s*<button\s+className="header-action-button"\s+aria-label=\{t\('browser\.agentUsing'\)\}/s,
    )
    expect(source).toMatch(
      /\{browserOpen \? \(\s*<Suspense fallback=\{null\}>\s*<IabScreen/s,
    )
  })

  it('offers Preview HTML from the thread menu only inside a project', () => {
    expect(source).toMatch(
      /\.\.\.\(workspaceId\s*\?\s*\[\s*\{\s*key: 'preview-html',\s*label: t\('thread\.menu\.previewHtml'\),/s,
    )
    expect(source).toMatch(/<HtmlFileChooser\s+workspaceId=\{workspaceId\}/)
  })
})
