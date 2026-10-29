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
