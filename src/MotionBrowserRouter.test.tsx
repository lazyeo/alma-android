// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { Link, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

const finished = Promise.resolve()

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-nav-motion')
})

describe('MotionBrowserRouter', () => {
  it('mounts and subscribes to a destination thread once per transition', async () => {
    window.history.replaceState(null, '', '/d/home/threads')
    const updateCalls = vi.fn()
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: vi.fn(() => ({ matches: false })),
    })
    Object.defineProperty(document, 'startViewTransition', {
      configurable: true,
      value: vi.fn((update: () => void) => {
        updateCalls()
        update()
        return { finished }
      }),
    })
    const { MotionBrowserRouter } = await import('./MotionBrowserRouter')
    let mounts = 0
    let subscriptions = 0

    function ThreadFixture() {
      mounts += 1
      useEffect(() => {
        subscriptions += 1
      }, [])
      return <h1>Thread detail</h1>
    }

    render(
      <MotionBrowserRouter>
        <Routes>
          <Route
            path="/d/home/threads"
            element={<Link to="/d/home/threads/t-1">Open thread</Link>}
          />
          <Route path="/d/home/threads/:threadId" element={<ThreadFixture />} />
        </Routes>
      </MotionBrowserRouter>,
    )

    screen.getByRole('link', { name: 'Open thread' }).click()
    expect(
      await screen.findByRole('heading', { name: 'Thread detail' }),
    ).toBeTruthy()
    expect(updateCalls).toHaveBeenCalledTimes(1)
    expect(mounts).toBe(1)
    expect(subscriptions).toBe(1)
  })
})
