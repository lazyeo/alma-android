import { describe, expect, it } from 'vitest'
import type { MascotRigGeometry } from '../../extensions/mascotRig'
import { rigPixelRatio, shouldAnimate } from './MascotRig'
import { portraitView } from './paint'

const geometry: MascotRigGeometry = {
  size: [1000, 1000],
  eyes: {
    L: { x: 300, y: 420, w: 150, h: 140, iris: [390, 500, 40, 45], lashY: 460 },
    R: { x: 540, y: 420, w: 140, h: 140, iris: [600, 500, 40, 45], lashY: 460 },
  },
  mouth: { cx: 500, cy: 620, w: 24 },
}

describe('portraitView', () => {
  it('centres on the eyes and sizes the window from the face', () => {
    const view = portraitView(geometry)
    // eye-to-mouth 120 → side 768, centre above the eyes by 72
    expect(view.side).toBeCloseTo(768)
    expect(view.x + view.side / 2).toBeCloseTo(495)
    expect(view.y + view.side / 2).toBeCloseTo(428)
  })

  it('stays inside the image and never exceeds it', () => {
    const tall = { ...geometry, mouth: { ...geometry.mouth, cy: 900 } }
    const view = portraitView(tall)
    expect(view.side).toBe(1000)
    expect(view.x).toBe(0)
    expect(view.y).toBe(0)
    const corner = portraitView({
      ...geometry,
      eyes: {
        L: { ...geometry.eyes.L, iris: [60, 80, 10, 10] },
        R: { ...geometry.eyes.R, iris: [100, 80, 10, 10] },
      },
      mouth: { cx: 80, cy: 140, w: 10 },
    })
    expect(corner.x).toBe(0)
    expect(corner.y).toBe(0)
  })
})

describe('MascotRig helpers', () => {
  it('caps the pixel ratio between 1 and 3', () => {
    expect(rigPixelRatio(0)).toBe(1)
    expect(rigPixelRatio(2.75)).toBe(2.75)
    expect(rigPixelRatio(4)).toBe(3)
  })

  it('animates only when allowed, on screen and the page is visible', () => {
    const on = { animated: true, intersecting: true, pageVisible: true }
    expect(shouldAnimate(on)).toBe(true)
    expect(shouldAnimate({ ...on, animated: false })).toBe(false)
    expect(shouldAnimate({ ...on, intersecting: false })).toBe(false)
    expect(shouldAnimate({ ...on, pageVisible: false })).toBe(false)
  })
})
