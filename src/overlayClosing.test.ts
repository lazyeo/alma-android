import { describe, expect, it } from 'vitest'
import {
  advanceOverlayClosing,
  initialOverlayClosingState,
  shouldFinishOverlayClose,
  type OverlayClosingState,
} from './overlayClosing'

describe('overlay closing state machine', () => {
  it('keeps an overlay mounted while its exit animation runs', () => {
    const open = initialOverlayClosingState(true)
    const closing = advanceOverlayClosing(open, { type: 'request-close' })

    expect(closing).toEqual({ phase: 'closing', rendered: true })
    expect(advanceOverlayClosing(closing, { type: 'finish-close' })).toEqual({
      phase: 'closed',
      rendered: false,
    })
  })

  it('ignores duplicate close requests and stale finish events', () => {
    const closing: OverlayClosingState = {
      phase: 'closing',
      rendered: true,
    }
    expect(advanceOverlayClosing(closing, { type: 'request-close' })).toBe(
      closing,
    )
    const closed = advanceOverlayClosing(closing, { type: 'finish-close' })
    expect(advanceOverlayClosing(closed, { type: 'finish-close' })).toBe(closed)
  })

  it('only finishes from the closing overlay element animation', () => {
    const overlay = new EventTarget()
    const child = new EventTarget()
    expect(shouldFinishOverlayClose(false, overlay, overlay)).toBe(false)
    expect(shouldFinishOverlayClose(true, child, overlay)).toBe(false)
    expect(shouldFinishOverlayClose(true, overlay, overlay)).toBe(true)
  })

  it('reopens cleanly if the controlled owner changes its mind', () => {
    const closing = advanceOverlayClosing(initialOverlayClosingState(true), {
      type: 'request-close',
    })
    expect(advanceOverlayClosing(closing, { type: 'open' })).toEqual({
      phase: 'open',
      rendered: true,
    })
  })
})
