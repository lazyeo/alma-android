import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { en } from '../i18n/en'

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), 'utf8')
const shell = read('../layout/AppShell.tsx')
const threads = read('./ThreadsScreen.tsx')
const gtd = read('./GtdScreen.tsx')
const organize = read('./ThreadOrganize.tsx')
const styles = read('../styles.css')
const capture = read('../../scripts/screenshots/capture.mjs')
const crystals = read('./CrystalsScreen.tsx')
const timeClues = read('./TimeCluesScreen.tsx')
const references = read('./ReferencesScreen.tsx')
const header = read('../layout/ScopedRootHeader.tsx')

describe('GTD navigation structure', () => {
  it('keeps GTD in the shared roots but removes it from the phone bottom bar', () => {
    const nav = /const NAV_ITEMS = \[([\s\S]*?)\] as const/.exec(shell)?.[1]
    expect(nav).toBeDefined()
    expect([...nav!.matchAll(/labelKey: '([^']+)'/g)].map((m) => m[1])).toEqual(
      ['nav.threads', 'nav.gtd', 'nav.settings'],
    )
    expect(shell).toContain(
      '<MainNav className="tab-bar" includeGtd={false} />',
    )
    expect(shell).toMatch(/<MainNav\s+className="split-nav"\s+compact/)
  })

  it('opens GTD from the Threads header between Library and Search', () => {
    expect(threads).toContain('ListTodo,')
    expect(threads).toContain('desktopGtdPath,')
    expect(threads).toMatch(
      /className="header-icon-button library-entry split-header-hidden"[\s\S]*className="header-icon-button gtd-entry split-header-hidden"[\s\S]*aria-label=\{t\('nav\.gtd'\)\}[\s\S]*<ListTodo size=\{19\} \/>[\s\S]*aria-label=\{t\('common\.search'\)\}/,
    )
    expect(threads).toContain('navigate(desktopGtdPath(pairing.id))')
    expect(styles).toMatch(
      /\.gtd-entry,\s*\.time-clues-entry,\s*\.library-entry \{[^}]*position: relative;/s,
    )
  })

  it('keeps the split rail entries and groups phone library destinations in one menu', () => {
    expect(threads).toContain("label={t('threads.library')}")
    expect(threads).toContain("aria-label={t('threads.library')}")
    expect(threads).toMatch(
      /label: t\('nav\.crystals'\)[\s\S]*label: t\('nav\.timeClues'\)[\s\S]*label: t\('nav\.references'\)/,
    )
    expect(threads).toMatch(/timeCluesUnread[\s\S]*library-unread-dot/)
    expect(threads).toMatch(/timeCluesUnread[\s\S]*library-menu-unread-dot/)
    expect(shell).toMatch(
      /<CrystalsRailLink desktopId=\{activeDesktopId\} \/>\s*<TimeCluesRailLink/,
    )
  })

  it('keeps only the Threads and Projects tabs inside Threads', () => {
    expect(threads).toContain("<TabBar<'threads' | 'projects'>")
    expect(threads).not.toMatch(/role="tab"[^>]*>\s*GTD/)
    expect(threads).not.toContain('isTodoThread(thread) ||')
    expect(styles).not.toContain('.thread-filter')
    expect(capture).not.toContain('.thread-filter')
  })

  it('keeps Archived out of the tabs and exposes it from the GTD header', () => {
    expect(gtd).toContain('className="header-icon-button gtd-archive-button"')
    expect(gtd).toContain(
      "aria-label={t('gtd.archivedCount', { count: counts.archived })}",
    )
    expect(styles).toContain('font-variant-numeric: tabular-nums')
    expect(capture).toContain('GTD visible labels')
    expect(capture).toContain('GTD accessible labels')
    expect(capture).toContain('GTD tab count not baseline-aligned')
  })

  it('uses concise English pin labels for favorites', () => {
    expect(organize).toContain("t('threads.organize.pin')")
    expect(organize).toContain("t('threads.organize.unpin')")
    expect(en.threads.organize.pin).toBe('Pin to top of Favorites')
    expect(en.threads.organize.unpin).toBe('Unpin from top')
    expect(organize).not.toMatch(/[\u3400-\u9fff]/u)
  })

  it('renders both segment rows through the shared TabBar primitive', () => {
    expect(threads).toContain("import { TabBar } from '../components/TabBar'")
    expect(gtd).toContain("import { TabBar } from '../components/TabBar'")
    expect(threads).toContain('<TabBar')
    expect(gtd).toContain('<TabBar')
    expect(gtd).not.toContain('useTabIndicator')
    expect(threads).not.toContain('useTabIndicator')
    expect(styles).not.toContain('.gtd-segments')
  })

  it('keeps the shared status row on one line and the indicator inside its box', () => {
    const block = /\n\.tab-bar-list \{([^}]*)\}/.exec(styles)?.[1] ?? ''
    const indicator =
      /\n\.tab-bar-indicator \{([^}]*)\}/.exec(styles)?.[1] ?? ''
    expect(block).toMatch(/flex-shrink: 0;/)
    expect(block).toMatch(/gap: 22px;/)
    expect(block).toMatch(/overflow-x: hidden;/)
    expect(block).toMatch(/padding-bottom: 1px;/)
    expect(indicator).toMatch(/bottom: 0;/)
    expect(indicator).toMatch(/height: 2px;/)
    expect(capture).toContain('visibleHeight')
  })

  it('renders root titles at the left and keeps desktop context out of headers', () => {
    expect(header).toContain('<h1>{title}</h1>')
    expect(header).not.toContain('DesktopSwitcher')
    expect(header).not.toContain('scoped-page-desktop')
    expect(styles).toMatch(
      /\.scoped-root-title h1 \{[\s\S]*font-size: var\(--text-display\)/,
    )
  })

  it('places one persistent desktop strip above phone navigation and at the sidebar bottom', () => {
    expect(shell).toContain('function ActiveDesktopStrip()')
    expect(shell).toContain('<DesktopSwitcher className="desktop-strip" />')
    expect(shell).toMatch(
      /<ActiveDesktopStrip \/>\s*<MainNav className="tab-bar" includeGtd=\{false\} \/>/,
    )
    expect(shell).toMatch(/<SidebarThreads[\s\S]*<ActiveDesktopStrip \/>/)
    expect(styles).toMatch(/\.desktop-strip \{[\s\S]*min-height: 28px/)
    expect(styles).toMatch(/\.desktop-status-marker \{[\s\S]*flex: 0 0 auto/)
    expect(styles).toMatch(
      /\.desktop-strip \.desktop-switcher-name \{[\s\S]*text-overflow: ellipsis/,
    )
    expect(styles).toContain(
      '--split-sidebar-width: clamp(260px, 27vw, 340px);',
    )
  })

  it('places Archive in the shared header action area and makes phone GTD a child', () => {
    expect(gtd).toContain('<ScopedRootHeader')
    expect(gtd).toContain('childOnPhone')
    expect(gtd).toContain('actions={')
    expect(gtd).not.toContain('<h1>GTD</h1>')
  })

  it('keeps Threads active in the phone bottom bar throughout GTD', () => {
    expect(shell).toMatch(
      /const active = gtd[\s\S]*: threads[\s\S]*pathname === to \|\| pathname\.startsWith\('\/d\/'\)/,
    )
    expect(shell).not.toMatch(/threads[\s\S]*!\/\^\\\/d\\\/\[\^\/\]\+\\\/gtd/)
    expect(capture).toContain('GTD phone Threads tab is not active')
    expect(capture).toContain('GTD phone tab indicator moved')
  })

  it('uses root headers in split mode and Back-only child headers on phones', () => {
    expect(header).toContain("mode === 'single'")
    expect(header).toContain('navigate(-1)')
    expect(header).not.toContain('DesktopSwitcher')
    for (const source of [crystals, timeClues, references])
      expect(source).toContain('<ScopedRootHeader')
    expect(references).toContain("title={t('nav.references')}")
    expect(capture).toContain('phone references Back missing')
    expect(capture).toContain('split Crystals unexpectedly shows Back')
  })
})
