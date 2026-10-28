import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  closeTopOverlay,
  handleOverlayPopState,
  overlayCount,
  registerOverlay,
  resetOverlayStackForTests,
} from './overlayStack'

describe('overlay stack', () => {
  beforeEach(resetOverlayStackForTests)

  it('closes only the topmost overlay in LIFO order', () => {
    const first = vi.fn()
    const second = vi.fn()
    const unregisterFirst = registerOverlay(first)
    const unregisterSecond = registerOverlay(second)

    expect(overlayCount()).toBe(2)
    expect(closeTopOverlay()).toBe(true)
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()

    unregisterSecond()
    expect(closeTopOverlay()).toBe(true)
    expect(first).toHaveBeenCalledTimes(1)
    unregisterFirst()
    expect(closeTopOverlay()).toBe(false)
  })

  it('closes an overlay and restores history on PWA popstate', () => {
    const close = vi.fn()
    const restoreHistory = vi.fn()
    registerOverlay(close)

    expect(handleOverlayPopState(restoreHistory)).toBe(true)
    expect(close).toHaveBeenCalledTimes(1)
    expect(restoreHistory).toHaveBeenCalledTimes(1)
  })

  it('leaves PWA popstate alone when no overlay is open', () => {
    const restoreHistory = vi.fn()
    expect(handleOverlayPopState(restoreHistory)).toBe(false)
    expect(restoreHistory).not.toHaveBeenCalled()
  })

  it('ignores stale unregister calls after an overlay is gone', () => {
    const close = vi.fn()
    const unregister = registerOverlay(close)
    unregister()
    unregister()
    expect(overlayCount()).toBe(0)
    expect(closeTopOverlay()).toBe(false)
  })
})
