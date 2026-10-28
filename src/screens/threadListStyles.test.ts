import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const screenSource = readFileSync(
  new URL('./ThreadsScreen.tsx', import.meta.url),
  'utf8',
)
const styles = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
const threadScreenSource = readFileSync(
  new URL('./ThreadScreen.tsx', import.meta.url),
  'utf8',
)
const rowSource = readFileSync(
  new URL('./ThreadListRow.tsx', import.meta.url),
  'utf8',
)

describe('thread list interaction styling', () => {
  it('closes the thread action menu immediately for row actions', () => {
    expect(screenSource).toContain('immediateClose')
  })

  it('does not render a visible per-row actions button', () => {
    expect(screenSource).not.toContain('MoreHorizontal')
    expect(screenSource).not.toContain('className="thread-more"')
  })

  it('keeps selected rows subtle and pressed rows muted', () => {
    expect(styles).toMatch(
      /\.thread-row\.selected \{[^}]*background: var\(--accent-3\);/s,
    )
    expect(styles).toContain('.thread-row:active {')
    expect(styles).toMatch(
      /\.thread-row:active \{[^}]*background: var\(--muted\);/s,
    )
    expect(styles).toMatch(
      /\.project-thread-row\.selected \{[^}]*background: var\(--accent-3\);/s,
    )
    expect(styles).toMatch(
      /\.thread-row \{[^}]*border-bottom: 0;[^}]*border-radius: var\(--radius-md\);/s,
    )
    expect(styles).toMatch(
      /\.project-thread-row \{[^}]*border: 0;[^}]*border-radius: max\(calc\(var\(--radius-md\) - 4px\), 4px\);/s,
    )
    expect(styles).toMatch(
      /\.project-group\.open \{[^}]*border-color: var\(--gray-7\);[^}]*background: var\(--gray-2\);/s,
    )
    expect(styles).not.toMatch(
      /\.thread-row,\s*\.project-group \.project-row \{[^}]*margin-inline: -4px;/s,
    )
    expect(styles).not.toMatch(
      /\.project-thread-row \{[^}]*width: calc\(100% \+ 4px\);[^}]*margin-inline: -4px 0;/s,
    )
  })

  it('renders the installed queue accessory', () => {
    expect(threadScreenSource).toContain('{extensionQueue.accessory}')
  })
  it('measures the selected tab and drives one shared indicator with CSS variables', () => {
    const tabBar = readFileSync(
      new URL('../components/TabBar.tsx', import.meta.url),
      'utf8',
    )
    // Measurement lives in the shared hook behind the shared TabBar.
    const indicator = readFileSync(
      new URL('../components/useTabIndicator.ts', import.meta.url),
      'utf8',
    )
    expect(tabBar).toContain('const tabListRef = useRef<HTMLDivElement>(null)')
    expect(tabBar).toContain('useTabIndicator(tabListRef, selected)')
    expect(indicator).toMatch(
      /querySelector<HTMLElement>\(\s*'\[aria-selected="true"\]',?\s*\)/s,
    )
    expect(indicator).toContain("style.setProperty('--tab-x'")
    expect(indicator).toContain("style.setProperty('--tab-w'")
    expect(indicator).toContain("tabList.dataset.tabReady = 'true'")
    expect(indicator).toContain('new ResizeObserver(measure)')
    expect(indicator).toContain('document.fonts.ready.then(measure)')
    expect(tabBar).toContain('ref={tabListRef}')
    expect(styles).toMatch(
      /\.tab-bar-indicator \{[^}]*width: var\(--tab-w\);[^}]*transform: translateX\(var\(--tab-x\)\);/s,
    )
    expect(styles).toMatch(
      /\.thread-tabs\[data-tab-ready='true'\] \.tab-bar-indicator \{[^}]*transition:\s*transform var\(--dur-panel\)/s,
    )
    expect(styles).not.toContain('.thread-tabs button::after')
    expect(styles).not.toContain('.thread-tabs.projects::after')
  })

  it('shows active GTD status icons and favorite marks through shared row content', () => {
    expect(rowSource).toContain('GTD_STATUS_ICON')
    expect(rowSource).toContain('aria-label={gtdStatusLabel(gtdStatus)}')
    expect(rowSource).toContain('className="thread-favorite-star"')
    expect(rowSource).toContain("aria-label={t('threads.row.favorite')}")
    expect(styles).toMatch(
      /\.thread-favorite-star \{[^}]*color: var\(--amber-11\);/s,
    )
    expect(styles).toMatch(
      /\.thread-favorite-pin \{[^}]*color: var\(--gray-11\);/s,
    )
  })

  it('keeps header actions unboxed and project creation inline', () => {
    expect(screenSource).toContain('className="header-icon-button"')
    expect(screenSource).toContain('className="project-new-action"')
    expect(styles).toMatch(
      /\.header-icon-button \{[^}]*border: 0;[^}]*background: transparent;/s,
    )
  })

  it('merges browser and native safe areas through unified variables', () => {
    for (const side of ['top', 'right', 'bottom', 'left']) {
      expect(styles).toContain(`--native-safe-${side}: 0px;`)
      expect(styles).toMatch(
        new RegExp(
          `--safe-${side}: max\\(\\s*env\\(safe-area-inset-${side}, 0px\\),\\s*var\\(--native-safe-${side}\\)\\s*\\);`,
          's',
        ),
      )
    }
    expect(styles.replace(/--safe-[^:]+:\s*max\([^;]+;/gs, '')).not.toContain(
      'env(safe-area-inset',
    )
  })

  it('gives every top header a solid status-bar backdrop', () => {
    for (const selector of [
      '.page-header',
      '.detail-header',
      '.project-detail-header',
      '.crystals-header',
      '.thread-list-header',
    ]) {
      expect(styles).toMatch(
        new RegExp(
          `${selector.replace('.', '\\\.')} \\{[^}]*background: var\\(--background\\);`,
          's',
        ),
      )
    }
  })

  it('locks root pages to the viewport and scrolls only their page body', () => {
    expect(screenSource).toContain('className="root-page threads-page"')
    const headerIndex = screenSource.indexOf('<ScopedRootHeader')
    const tabsIndex = screenSource.indexOf("<TabBar<'threads' | 'projects'>")
    const bodyIndex = screenSource.indexOf(
      'className="page-body threads-page-body"',
    )
    expect(headerIndex).toBeGreaterThan(-1)
    expect(tabsIndex).toBeGreaterThan(headerIndex)
    expect(bodyIndex).toBeGreaterThan(tabsIndex)
    expect(screenSource).not.toMatch(
      /<div className="page-body threads-page-body">\s*<TabBar/,
    )
    expect(styles).toMatch(
      /html,\s*body,\s*#root \{[^}]*height: 100%;[^}]*overflow: hidden;/s,
    )
    expect(styles).toMatch(
      /\.app-shell \{[^}]*height: 100dvh;[^}]*overflow: hidden;/s,
    )
    const rootPage = styles.match(/\.root-page \{([^}]*)\}/s)?.[1]
    expect(rootPage).toContain('display: flex;')
    expect(rootPage).toContain('flex-direction: column;')
    expect(rootPage).toContain('min-height: 0;')
    expect(rootPage).toContain('overflow: hidden;')
    const pageBody = styles.match(/\.page-body \{([^}]*)\}/s)?.[1]
    expect(pageBody).toContain('flex: 1 1 auto;')
    expect(pageBody).toContain('min-height: 0;')
    expect(pageBody).toContain('overflow-y: auto;')
    expect(pageBody).toContain('overscroll-behavior: contain;')
    expect(styles).toMatch(
      /\.split-sidebar \{[^}]*display: flex;[^}]*overflow: hidden;/s,
    )
    expect(styles).toMatch(/\.split-main\.page \{[^}]*overflow: hidden;/s)
  })

  it('keeps reply usage and actions in one vertically centred footer row', () => {
    expect(threadScreenSource).toMatch(
      /<footer[\s\S]*?<div className="message-footer-meta">[\s\S]*?<UsageFooter usage=\{usage\}/,
    )
    expect(styles).toMatch(
      /\.message-footer-meta \{[^}]*display: flex;[^}]*align-items: center;/s,
    )
    expect(styles).toMatch(
      /\.message-footer-meta \.usage-footer \{[^}]*flex-wrap: nowrap;[^}]*overflow: hidden;/s,
    )
  })

  it('contains no literal colors in styles.css', () => {
    expect(styles).not.toMatch(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(/i)
  })
})
