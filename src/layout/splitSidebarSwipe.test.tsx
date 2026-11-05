// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useRef, useState } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { useSidebarSwipe } from './useSidebarSwipe'

beforeAll(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: true })
})

afterEach(cleanup)

function SplitSwipeHarness({ route }: { route: 'threads' | 'agents' }) {
  const [collapsed, setCollapsed] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const swipe = useSidebarSwipe(shellRef, collapsed, setCollapsed)
  return (
    <div
      ref={shellRef}
      className={`split-shell${collapsed ? ' collapsed' : ''}`}
      data-testid="split-shell"
      data-route={route}
      {...swipe}
    >
      <aside className="split-sidebar">
        <div className="split-sidebar-content">
          <div data-sidebar-swipe-exclude data-testid="workspace-chips" />
        </div>
      </aside>
      <main className="split-main">
        <div data-sidebar-swipe-exclude data-testid="grid-terminal" />
      </main>
    </div>
  )
}

function swipeClosed(target: HTMLElement) {
  fireEvent.pointerDown(target, {
    button: 0,
    pointerId: 1,
    clientX: 200,
    clientY: 100,
  })
  fireEvent.pointerMove(target, {
    pointerId: 1,
    clientX: 40,
    clientY: 100,
  })
  fireEvent.pointerUp(target, {
    pointerId: 1,
    clientX: 40,
    clientY: 100,
  })
}

describe('split layout sidebar swipe', () => {
  it.each(['threads', 'agents'] as const)(
    'collapses the sidebar with the same swipe on the %s route',
    (route) => {
      const { getByTestId } = render(<SplitSwipeHarness route={route} />)
      const shell = getByTestId('split-shell')
      const sidebar = shell.querySelector<HTMLElement>('.split-sidebar')!
      Object.defineProperty(sidebar, 'getBoundingClientRect', {
        value: () => ({ width: 300 }),
      })
      Object.defineProperty(shell, 'setPointerCapture', { value: vi.fn() })

      swipeClosed(sidebar)

      expect(shell.classList.contains('collapsed')).toBe(true)
    },
  )

  it.each(['workspace-chips', 'grid-terminal'])(
    'ignores swipes starting in the excluded %s region',
    (testId) => {
      const { getByTestId } = render(<SplitSwipeHarness route="agents" />)
      const shell = getByTestId('split-shell')

      swipeClosed(getByTestId(testId))

      expect(shell.classList.contains('collapsed')).toBe(false)
    },
  )
})

type Route = 'threads' | 'thread' | 'gtd' | 'settings' | 'agents'

/**
 * A wide shell like AppShell's: 72px rail, 320px list pane, and the page.
 * On GTD the list pane is the GTD list, whose rows own horizontal swipes.
 */
function RouteHarness({ route }: { route: Route }) {
  const [collapsed, setCollapsed] = useState(true)
  const shellRef = useRef<HTMLDivElement>(null)
  const swipe = useSidebarSwipe(shellRef, collapsed, setCollapsed)
  return (
    <div
      ref={shellRef}
      className={`split-shell${collapsed ? ' collapsed' : ''}`}
      data-testid="split-shell"
      {...swipe}
    >
      <div className="split-rail" />
      <aside className="split-sidebar">
        <div className="split-sidebar-content">
          {route === 'gtd' ? (
            <div className="gtd-swipe-row" data-testid="gtd-row" />
          ) : (
            <div data-testid="list-row" />
          )}
        </div>
      </aside>
      <main className="split-main">
        <div data-testid="page" />
      </main>
    </div>
  )
}

function renderRoute(route: Route) {
  const view = render(<RouteHarness route={route} />)
  const shell = view.getByTestId('split-shell')
  const open = () => !shell.classList.contains('collapsed')
  Object.defineProperty(shell, 'setPointerCapture', { value: vi.fn() })
  const sidebar = shell.querySelector<HTMLElement>('.split-sidebar')!
  Object.defineProperty(sidebar, 'getBoundingClientRect', {
    value: () => ({ left: 72, width: open() ? 320 : 0 }),
  })
  Object.defineProperty(
    shell.querySelector<HTMLElement>('.split-sidebar-content')!,
    'offsetWidth',
    { value: 320 },
  )
  Object.defineProperty(
    shell.querySelector<HTMLElement>('.split-main')!,
    'getBoundingClientRect',
    {
      value: () =>
        open() ? { left: 392, width: 808 } : { left: 72, width: 1128 },
    },
  )
  return { ...view, shell, open }
}

let clock = 0

/** A slow drag (1 s): the distance threshold decides, not the fling. */
function drag(target: HTMLElement, fromX: number, toX: number) {
  vi.spyOn(performance, 'now').mockImplementation(() => clock)
  fireEvent.pointerDown(target, {
    button: 0,
    pointerId: 1,
    clientX: fromX,
    clientY: 300,
  })
  clock += 1000
  fireEvent.pointerMove(target, { pointerId: 1, clientX: toX, clientY: 300 })
  fireEvent.pointerUp(target, { pointerId: 1, clientX: toX, clientY: 300 })
  vi.mocked(performance.now).mockRestore()
}

describe('split layout sidebar swipe on every wide page', () => {
  it('opens and closes the GTD list from the page beside it', () => {
    const { getByTestId, open } = renderRoute('gtd')
    drag(getByTestId('page'), 200, 420)
    expect(open()).toBe(true)
    // The list is now GTD rows; the close starts where the open did.
    drag(getByTestId('page'), 520, 300)
    expect(open()).toBe(false)
  })

  it('leaves a GTD row its own left swipe', () => {
    const { getByTestId, open } = renderRoute('gtd')
    drag(getByTestId('page'), 200, 420)
    drag(getByTestId('gtd-row'), 300, 100)
    expect(open()).toBe(true)
  })

  it.each(['threads', 'thread', 'gtd', 'settings', 'agents'] as const)(
    'closes from the page with the open threshold on %s',
    (route) => {
      const { getByTestId, open } = renderRoute(route)
      drag(getByTestId('page'), 200, 420)
      expect(open()).toBe(true)
      // Not past 40% of the list width: stays open, as on Threads.
      drag(getByTestId('page'), 520, 520 - 0.3 * 320)
      expect(open()).toBe(true)
      drag(getByTestId('page'), 520, 300)
      expect(open()).toBe(false)
    },
  )

  it('ignores a close starting past the left 40% of the page', () => {
    const { getByTestId, open } = renderRoute('gtd')
    drag(getByTestId('page'), 200, 420)
    drag(getByTestId('page'), 1000, 780)
    expect(open()).toBe(true)
  })
})
