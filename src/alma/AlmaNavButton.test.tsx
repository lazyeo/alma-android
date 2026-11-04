// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import type { PersonalAgentState } from '../screens/personalAgent'
import { AlmaNavButton } from './AlmaNavButton'
import { AlmaPresenceContext, presenceFace } from './AlmaPresence'
import { clearExpandDisc, lastExpandDisc } from './almaExpand'
import { avatarBox, clearAvatarBoxes } from './avatarFlight'

import { haptic } from '../haptics'

vi.mock('../haptics', () => ({ haptic: vi.fn() }))
vi.mock('./AlmaScreen', () => ({ AlmaScreen: () => null }))

afterEach(() => {
  cleanup()
  clearExpandDisc()
  clearAvatarBoxes()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const ready = (
  threadId: string | null,
  counters: { running?: number; pendingApprovals?: number } = {},
): PersonalAgentState => ({
  status: 'ready',
  personal: {
    threadId,
    today: { spentUsd: 0, budgetUsd: null, over: false },
    running: counters.running ?? 0,
    pendingApprovals: counters.pendingApprovals ?? 0,
  },
})

function Where() {
  return <output data-testid="where">{useLocation().pathname}</output>
}

function renderButton(
  state: PersonalAgentState,
  {
    generating = false,
    route = '/d/home/threads',
    prefetchThread = vi.fn(),
  }: {
    generating?: boolean
    route?: string
    prefetchThread?: (fallbackTitle: string) => void
  } = {},
) {
  return render(
    <LanguageProvider>
      <AlmaPresenceContext.Provider
        value={{
          desktopId: 'home',
          state,
          generating,
          face: presenceFace(state, generating),
          refresh: vi.fn(),
          prefetchThread,
        }}
      >
        <MemoryRouter initialEntries={[route]}>
          <Routes>
            <Route
              path="*"
              element={
                <>
                  <AlmaNavButton placement="tab" />
                  <Where />
                </>
              }
            />
          </Routes>
        </MemoryRouter>
      </AlmaPresenceContext.Provider>
    </LanguageProvider>,
  )
}

const button = () =>
  screen.queryByRole('button', { name: 'Open Alma main conversation' })

describe('AlmaNavButton', () => {
  it.each(['loading', 'unsupported', 'error'] as const)(
    'renders nothing while %s',
    (status) => {
      const { container } = renderButton({ status })
      expect(container.querySelector('.alma-nav')).toBeNull()
    },
  )

  it('opens the setup sheet instead of navigating when no thread is set', () => {
    renderButton(ready(null))
    fireEvent.click(button()!)
    expect(
      screen.getByRole('dialog', { name: 'Alma is not on yet' }),
    ).toBeTruthy()
    expect(
      screen.getByText('Turn it on in desktop Settings → Personal agent.'),
    ).toBeTruthy()
    expect(screen.getByTestId('where').textContent).toBe('/d/home/threads')
  })

  it('navigates to /alma when the main thread is set', () => {
    renderButton(ready('main'))
    fireEvent.click(button()!)
    expect(screen.getByTestId('where').textContent).toBe('/d/home/alma')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('presses the disc and ticks on pointer-down without fetching', () => {
    const prefetchThread = vi.fn()
    const { container } = renderButton(ready('main'), { prefetchThread })
    const disc = container.querySelector<HTMLElement>('.alma-nav-avatar')!
    vi.mocked(haptic).mockClear()
    fireEvent.pointerDown(button()!)
    expect(disc.dataset.pressed).toBe('true')
    expect(haptic).toHaveBeenCalledWith('light')
    expect(prefetchThread).not.toHaveBeenCalled()
    fireEvent.pointerUp(button()!)
    expect(disc.dataset.pressed).toBeUndefined()
    // The click itself adds no second tick.
    fireEvent.click(button()!, { detail: 1 })
    expect(haptic).toHaveBeenCalledTimes(1)
  })

  it('shows the approval dot only while something waits', () => {
    const { container, unmount } = renderButton(ready('main'))
    expect(container.querySelector('.alma-nav-badge')).toBeNull()
    unmount()
    renderButton(ready('main', { pendingApprovals: 2 }))
    expect(screen.getByLabelText('Needs your OK')).toBeTruthy()
  })

  it('breathes while runs are active or the main thread generates', () => {
    const idle = renderButton(ready('main'))
    expect(idle.container.querySelector('.alma-nav-ring')).toBeNull()
    idle.unmount()
    const running = renderButton(ready('main', { running: 1 }))
    expect(running.container.querySelector('.alma-nav-ring')).toBeTruthy()
    expect(
      running.container.querySelector('svg')?.getAttribute('data-activity'),
    ).toBe('thinking')
    running.unmount()
    const live = renderButton(ready('main'), { generating: true })
    expect(live.container.querySelector('[data-busy="true"]')).toBeTruthy()
  })

  it('measures the disc after layout and never in the tap', () => {
    const observed: Array<() => void> = []
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private callback: () => void) {}
        observe() {
          observed.push(this.callback)
        }
        disconnect() {}
      },
    )
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue({
        left: 178,
        top: 796,
        width: 44,
        height: 44,
      } as DOMRect)
    renderButton(ready('main'))
    expect(observed).toHaveLength(1)
    observed[0]()
    expect(lastExpandDisc()).toMatchObject({ left: 178, width: 44 })
    expect(avatarBox('nav')).toMatchObject({ top: 796, height: 44 })
    rect.mockClear()
    fireEvent.click(button()!)
    expect(screen.getByTestId('where').textContent).toBe('/d/home/alma')
    expect(rect).not.toHaveBeenCalled()
  })

  it('marks the nav end of the avatar flight only outside /alma', () => {
    const { container, unmount } = renderButton(ready('main'))
    const avatar = container.querySelector('.alma-avatar-flight')
    expect(avatar?.getAttribute('data-alma-avatar')).toBe('nav')
    unmount()
    renderButton(ready('main'), { route: '/d/home/alma' })
    expect(button()!.getAttribute('aria-current')).toBe('page')
    expect(document.querySelector('.alma-avatar-flight')).toBeNull()
    expect(document.querySelector('[data-alma-avatar]')).toBeNull()
    fireEvent.click(button()!)
    expect(screen.getByTestId('where').textContent).toBe('/d/home/alma')
  })
})
