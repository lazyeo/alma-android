import { describe, expect, it } from 'vitest'
import {
  bubbleFrame,
  HIT_PAD,
  holdLayout,
  inCapsule,
  MAX_BAND,
  zoneAt,
} from './holdLayout'

// A folded phone's cover screen, a regular phone, an unfolded inner screen.
const COVER = holdLayout(344, 882, 24)
const PHONE = holdLayout(412, 915, 24)
const INNER = holdLayout(884, 1104, 24)

describe('holdLayout', () => {
  it('keeps the capsules inside the screen and above the arc', () => {
    for (const layout of [COVER, PHONE, INNER]) {
      const { cancel, edit, arc } = layout
      expect(cancel.cx - cancel.width / 2).toBeGreaterThanOrEqual(0)
      expect(edit.cx + edit.width / 2).toBeLessThanOrEqual(layout.width)
      expect(cancel.cx + cancel.width / 2).toBeLessThan(
        edit.cx - edit.width / 2,
      )
      const arcTop = arc.cy - arc.r
      expect(cancel.cy + cancel.height / 2).toBeLessThan(arcTop)
      expect(layout.bubbleBottom).toBeLessThan(cancel.cy - cancel.height / 2)
    }
  })

  it('does not stretch the capsules on a wide screen', () => {
    expect(INNER.band).toBe(MAX_BAND)
    expect(INNER.edit.width).toBeLessThan(260)
    expect(INNER.cancel.cx).toBeGreaterThan(INNER.width / 4)
  })

  it('keeps the arc above the safe area', () => {
    const plain = holdLayout(412, 915, 0)
    expect(PHONE.arc.cy - PHONE.arc.r).toBe(plain.arc.cy - plain.arc.r - 24)
  })

  it('dips the outer ends of both capsules', () => {
    expect(PHONE.cancel.angle).toBeLessThan(0)
    expect(PHONE.edit.angle).toBeGreaterThan(0)
  })
})

describe('inCapsule', () => {
  const flat = { cx: 100, cy: 100, width: 200, height: 60, angle: 0 }

  it('hits the body and the rounded ends, give or take the pad', () => {
    expect(inCapsule(flat, 100, 100)).toBe(true)
    expect(inCapsule(flat, 5, 100)).toBe(true)
    expect(inCapsule(flat, 100, 130 + HIT_PAD - 1)).toBe(true)
    expect(inCapsule(flat, 100, 130 + HIT_PAD + 1)).toBe(false)
    // The corner of the bounding box lies outside the rounded end.
    expect(inCapsule(flat, 2, 72, 0)).toBe(false)
  })

  it('follows the rotation', () => {
    const turned = { ...flat, angle: 30 }
    // Clockwise: the right end drops, the left end rises.
    const along = (distance: number) => [
      100 + distance * Math.cos(Math.PI / 6),
      100 + distance * Math.sin(Math.PI / 6),
    ]
    const [rx, ry] = along(90)
    expect(inCapsule(turned, rx, ry, 0)).toBe(true)
    expect(inCapsule(flat, rx, ry, 0)).toBe(false)
    const [lx, ly] = along(-90)
    expect(inCapsule(turned, lx, ly, 0)).toBe(true)
    // Straight above the centre, past the thickness: off it.
    expect(inCapsule(turned, 100, 60, 0)).toBe(false)
  })
})

describe('zoneAt', () => {
  it('names the capsule under the finger', () => {
    for (const layout of [COVER, PHONE, INNER]) {
      expect(zoneAt(layout, layout.cancel.cx, layout.cancel.cy)).toBe('cancel')
      expect(zoneAt(layout, layout.edit.cx, layout.edit.cy)).toBe('edit')
    }
  })

  it('is release on the arc, between the capsules and above them', () => {
    const { arc, cancel } = PHONE
    expect(zoneAt(PHONE, arc.cx, arc.cy - arc.r + 30)).toBe('release')
    expect(zoneAt(PHONE, PHONE.width / 2, cancel.cy)).toBe('release')
    expect(zoneAt(PHONE, cancel.cx, cancel.cy - 120)).toBe('release')
  })
})

describe('bubbleFrame', () => {
  it('shrinks over the cancel capsule and widens for editing', () => {
    const release = bubbleFrame(PHONE, 'release')
    const cancel = bubbleFrame(PHONE, 'cancel')
    const edit = bubbleFrame(PHONE, 'edit')
    expect(release.tailX).toBe(PHONE.width / 2)
    expect(cancel.width).toBeLessThan(release.width)
    expect(cancel.tailX).toBeCloseTo(PHONE.cancel.cx)
    expect(edit.width).toBe(PHONE.band)
    expect(edit.tailX).toBe(PHONE.edit.cx)
    for (const zone of ['release', 'cancel', 'edit'] as const) {
      const frame = bubbleFrame(COVER, zone)
      expect(frame.left).toBeGreaterThanOrEqual(0)
      expect(frame.left + frame.width).toBeLessThanOrEqual(COVER.width)
    }
  })
})
