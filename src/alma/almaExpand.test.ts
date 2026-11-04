// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import {
  applyExpand,
  clearExpand,
  clearExpandDisc,
  expandMode,
  expandOrigin,
  lastExpandDisc,
  recordExpandDisc,
} from './almaExpand'

const phone = { width: 400, height: 800 }

describe('expandOrigin', () => {
  it('centres on the disc and reaches the farthest corner', () => {
    // Tab bar disc, centred at the bottom of the screen.
    const origin = expandOrigin(
      { left: 176, top: 728, width: 48, height: 48 },
      phone,
    )
    expect(origin.x).toBe(200)
    expect(origin.y).toBe(752)
    // Farthest corners are the top ones: hypot(200, 752).
    expect(origin.radius).toBe(Math.ceil(Math.hypot(200, 752)))
  })

  it('picks the far side for an off-centre rail disc', () => {
    const origin = expandOrigin(
      { left: 10, top: 10, width: 44, height: 44 },
      { width: 1200, height: 900 },
    )
    expect(origin).toEqual({
      x: 32,
      y: 32,
      radius: Math.ceil(Math.hypot(1200 - 32, 900 - 32)),
    })
  })

  it('covers every corner of the viewport', () => {
    const box = { left: 300, top: 100, width: 40, height: 40 }
    const { x, y, radius } = expandOrigin(box, phone)
    for (const [cx, cy] of [
      [0, 0],
      [phone.width, 0],
      [0, phone.height],
      [phone.width, phone.height],
    ])
      expect(Math.hypot(cx - x, cy - y)).toBeLessThanOrEqual(radius)
  })
})

describe('expandMode', () => {
  it('reveals with View Transitions and FLIPs without them', () => {
    expect(
      expandMode({ reduced: false, viewTransitions: true, hasOrigin: true }),
    ).toBe('reveal')
    expect(
      expandMode({ reduced: false, viewTransitions: false, hasOrigin: true }),
    ).toBe('flip')
  })

  it('crossfades under reduced motion or with no disc to grow from', () => {
    for (const viewTransitions of [true, false]) {
      expect(
        expandMode({ reduced: true, viewTransitions, hasOrigin: true }),
      ).toBe('crossfade')
      expect(
        expandMode({ reduced: false, viewTransitions, hasOrigin: false }),
      ).toBe('crossfade')
    }
  })
})

describe('applyExpand', () => {
  afterEach(() => {
    clearExpandDisc()
    clearExpand()
  })

  it('ignores an empty disc box', () => {
    recordExpandDisc({ left: 0, top: 0, width: 0, height: 0 })
    expect(lastExpandDisc()).toBeUndefined()
  })

  it('publishes origin variables and direction for open and close', () => {
    const root = document.documentElement
    recordExpandDisc({ left: 176, top: 728, width: 48, height: 48 })
    expect(
      applyExpand(
        'open',
        { reduced: false, viewTransitions: true },
        root,
        phone,
      ),
    ).toBe('reveal')
    expect(root.getAttribute('data-alma-expand')).toBe('open-reveal')
    expect(root.style.getPropertyValue('--alma-expand-x')).toBe('200px')
    expect(root.style.getPropertyValue('--alma-expand-y')).toBe('752px')
    // Back reuses the same disc to collapse into.
    expect(
      applyExpand(
        'close',
        { reduced: false, viewTransitions: false },
        root,
        phone,
      ),
    ).toBe('flip')
    expect(root.getAttribute('data-alma-expand')).toBe('close-flip')
    clearExpand(root)
    expect(root.hasAttribute('data-alma-expand')).toBe(false)
    expect(root.style.getPropertyValue('--alma-expand-r')).toBe('')
  })

  it('leaves no expand state behind under reduced motion', () => {
    const root = document.documentElement
    recordExpandDisc({ left: 176, top: 728, width: 48, height: 48 })
    expect(
      applyExpand(
        'open',
        { reduced: true, viewTransitions: true },
        root,
        phone,
      ),
    ).toBe('crossfade')
    expect(root.hasAttribute('data-alma-expand')).toBe(false)
    expect(root.style.getPropertyValue('--alma-expand-x')).toBe('')
  })
})
