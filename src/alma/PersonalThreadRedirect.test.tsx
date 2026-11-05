// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PersonalAgentState } from '../screens/personalAgent'
import { AlmaPresenceContext, type AlmaPresence } from './AlmaPresence'
import { PersonalThreadRedirect } from './PersonalThreadRedirect'
import { personalThreadKey } from './personalSetup'

beforeEach(() => {
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  })
})
afterEach(() => {
  cleanup()
})

const ready = (threadId: string | null): PersonalAgentState => ({
  status: 'ready',
  personal: {
    threadId,
    today: { spentUsd: 0, budgetUsd: null, over: false },
    running: 0,
    pendingApprovals: 0,
  },
})

const presence = (state: PersonalAgentState, desktopId = 'd1') =>
  ({
    desktopId,
    state,
    generating: false,
    face: { mood: 'neutral', activity: 'idle' },
    refresh: async () => undefined,
  }) as AlmaPresence

function open(path: string, value: AlmaPresence | null) {
  render(
    <AlmaPresenceContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/d/:desktopId">
            {['threads/:threadId', 'gtd/:threadId'].map((route) => (
              <Route
                key={route}
                path={route}
                element={
                  <PersonalThreadRedirect>
                    <p>thread view</p>
                  </PersonalThreadRedirect>
                }
              />
            ))}
            <Route path="alma" element={<p>alma screen</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </AlmaPresenceContext.Provider>,
  )
}

describe('PersonalThreadRedirect', () => {
  it('sends a deep link to her thread to the Alma screen', () => {
    open('/d/d1/threads/alma', presence(ready('alma')))
    expect(screen.getByText('alma screen')).toBeTruthy()
    cleanup()
    open('/d/d1/gtd/alma', presence(ready('alma')))
    expect(screen.getByText('alma screen')).toBeTruthy()
  })

  it('redirects from the cached id while presence is loading', () => {
    localStorage.setItem(personalThreadKey('d1'), 'alma')
    open('/d/d1/threads/alma', presence({ status: 'loading' }))
    expect(screen.getByText('alma screen')).toBeTruthy()
  })

  it('opens other threads normally', () => {
    open('/d/d1/threads/t1', presence(ready('alma')))
    expect(screen.getByText('thread view')).toBeTruthy()
  })

  it('opens the thread on a desktop without a personal agent', () => {
    localStorage.setItem(personalThreadKey('d1'), 'alma')
    open('/d/d1/threads/alma', presence({ status: 'unsupported' }))
    expect(screen.getByText('thread view')).toBeTruthy()
  })

  it('remembers the desktop thread for the next cold start', () => {
    open('/d/d1/threads/t1', presence(ready('alma')))
    expect(localStorage.getItem(personalThreadKey('d1'))).toBe('alma')
  })
})
