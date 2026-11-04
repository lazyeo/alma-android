import { describe, expect, it } from 'vitest'
import type { MascotRigGeometry } from '../../extensions/mascotRig'
import { rigScaleFactor, scaleRig } from './rigScale'

const rig: MascotRigGeometry = {
  size: [1254, 1254],
  eyes: {
    L: { x: 376, y: 524, w: 186, h: 179, iris: [491, 622, 50, 56], lashY: 572 },
    R: { x: 678, y: 522, w: 171, h: 181, iris: [748, 622, 50, 56], lashY: 572 },
  },
  mouth: { cx: 624, cy: 778, w: 30 },
}

describe('rigScaleFactor', () => {
  it('brings the longer side down to the limit and never upscales', () => {
    expect(rigScaleFactor(rig, 512)).toBeCloseTo(512 / 1254)
    expect(rigScaleFactor(rig, 2048)).toBe(1)
    expect(rigScaleFactor({ ...rig, size: [800, 1600] }, 400)).toBe(0.25)
  })

  it('keeps full size when the limit is off', () => {
    expect(rigScaleFactor(rig, 0)).toBe(1)
  })
})

describe('scaleRig', () => {
  const factor = rigScaleFactor(rig, 512)
  const scaled = scaleRig(rig, factor)

  it('lands the canvas exactly on the limit', () => {
    expect(scaled.size).toEqual([512, 512])
  })

  it('keeps eye layers whole pixels so resized PNGs match their boxes', () => {
    for (const side of ['L', 'R'] as const) {
      const eye = scaled.eyes[side]
      expect(Number.isInteger(eye.w)).toBe(true)
      expect(Number.isInteger(eye.h)).toBe(true)
      expect(eye.w).toBe(Math.round(rig.eyes[side].w * factor))
    }
    expect(scaled.eyes.L).toMatchObject({ w: 76, h: 73 })
  })

  it('scales every position proportionally', () => {
    expect(scaled.eyes.L.x).toBeCloseTo(376 * factor, 2)
    expect(scaled.eyes.R.iris[0]).toBeCloseTo(748 * factor, 2)
    expect(scaled.eyes.R.iris[3]).toBeCloseTo(56 * factor, 2)
    expect(scaled.eyes.L.lashY).toBeCloseTo(572 * factor, 2)
    expect(scaled.mouth.cy / scaled.size[1]).toBeCloseTo(778 / 1254, 3)
  })

  it('returns the same rig when no scaling is needed', () => {
    expect(scaleRig(rig, 1)).toBe(rig)
  })
})
