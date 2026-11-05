// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import type { PersonalAgentState } from '../screens/personalAgent'
import { AlmaHeader } from './AlmaHeader'
import { AlmaPresenceContext, presenceFace } from './AlmaPresence'

let split = false
beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: split,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
})
afterEach(() => {
  split = false
  cleanup()
})

const ready = (
  pendingApprovals = 0,
  running = 0,
  mood?: string,
): PersonalAgentState => ({
  status: 'ready',
  personal: {
    threadId: 'main',
    today: { spentUsd: 0, budgetUsd: null, over: false },
    running,
    pendingApprovals,
  },
  ...(mood ? { vitals: { mood } } : {}),
})

function renderHeader(
  state: PersonalAgentState,
  props: { generating?: boolean; onBack?: () => void } = {},
) {
  return render(
    <LanguageProvider>
      <AlmaPresenceContext.Provider
        value={{
          desktopId: 'home',
          state,
          generating: false,
          face: presenceFace(state, false),
          refresh: vi.fn(),
        }}
      >
        <AlmaHeader
          generating={props.generating ?? false}
          onBack={props.onBack}
        />
      </AlmaPresenceContext.Provider>
    </LanguageProvider>,
  )
}

describe('AlmaHeader', () => {
  it('titles the page Alma with her avatar as the flight target', () => {
    const { container } = renderHeader(ready())
    expect(screen.getByRole('heading', { name: 'Alma' })).toBeTruthy()
    const avatar = container.querySelector('.alma-avatar-flight')!
    expect(avatar.getAttribute('data-alma-avatar')).toBe('header')
    expect(avatar.nextElementSibling?.className).toBe('alma-heading')
    expect(container.querySelector('.alma-status')).toBeNull()
  })

  it('reports thinking from the open thread before anything else', () => {
    const { container } = renderHeader(ready(2, 1, 'happy'), {
      generating: true,
    })
    expect(screen.getByText('thinking…')).toBeTruthy()
    expect(container.querySelector('svg')?.dataset.activity).toBe('thinking')
  })

  it('shows waiting approvals, then work, then mood', () => {
    renderHeader(ready(3))
    expect(screen.getByText('3 things need your OK')).toBeTruthy()
    cleanup()
    renderHeader(ready(0, 2))
    expect(screen.getByText('working on 2 things')).toBeTruthy()
    cleanup()
    const { container } = renderHeader(ready(0, 0, 'happy'))
    expect(screen.getByText('Happy')).toBeTruthy()
    expect(container.querySelector('svg')?.dataset.mood).toBe('happy')
  })

  it('offers Back only when the layout needs it', () => {
    const onBack = vi.fn()
    renderHeader(ready(), { onBack })
    fireEvent.click(screen.getByRole('button', { name: 'Back to threads' }))
    expect(onBack).toHaveBeenCalledOnce()
    cleanup()
    renderHeader(ready())
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('leaves her face to the dock on split layouts and clears room for it', () => {
    split = true
    const { container } = renderHeader(ready(1, 1, 'happy'))
    const header = container.querySelector('header')!
    expect(header.classList.contains('docked')).toBe(true)
    expect(container.querySelector('.alma-avatar')).toBeNull()
    expect(container.querySelector('[data-alma-avatar]')).toBeNull()
    expect(screen.getByText('Alma')).toBeTruthy()
    expect(screen.getByText('1 thing needs your OK')).toBeTruthy()
  })

  it('keeps her face in the phone header', () => {
    const { container } = renderHeader(ready())
    expect(
      container.querySelector('header')!.classList.contains('docked'),
    ).toBe(false)
    expect(container.querySelectorAll('.alma-avatar')).toHaveLength(1)
  })
})
