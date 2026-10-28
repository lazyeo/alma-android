// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { suppressNextTap } from './ghostTap'

const fire = (type: string) => {
  const event = new Event(type, { bubbles: true, cancelable: true })
  document.body.dispatchEvent(event)
  return event.defaultPrevented
}

describe('suppressNextTap', () => {
  afterEach(() => vi.useRealTimers())

  it('swallows the release after a completed hold, then stops at the click', () => {
    const seen = vi.fn()
    document.body.addEventListener('click', seen)
    suppressNextTap()
    expect(fire('touchend')).toBe(true)
    expect(fire('mousedown')).toBe(true)
    expect(fire('click')).toBe(true)
    expect(seen).not.toHaveBeenCalled()
    expect(fire('click')).toBe(false)
    expect(seen).toHaveBeenCalledTimes(1)
    document.body.removeEventListener('click', seen)
  })

  it('expires so a later deliberate tap still works', () => {
    vi.useFakeTimers()
    suppressNextTap(document, 800)
    vi.advanceTimersByTime(801)
    expect(fire('touchend')).toBe(false)
    expect(fire('click')).toBe(false)
  })
})
