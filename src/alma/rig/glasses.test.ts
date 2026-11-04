import { describe, expect, it } from 'vitest'
import type { MascotRigGeometry } from '../../extensions/mascotRig'
import { RigEngine } from './engine'
import { glassesGeometry, rimWidth, type GlassesLens } from './glasses'
import { RigPainter, rigScale, type ScaledRigLayers } from './paint'

// Shaped like the official rig: the irises sit toward the nose in boxes of
// slightly different sizes.
const geometry: MascotRigGeometry = {
  size: [1254, 1254],
  eyes: {
    L: { x: 376, y: 524, w: 186, h: 179, iris: [491, 622, 50, 56], lashY: 572 },
    R: { x: 678, y: 522, w: 171, h: 181, iris: [748, 622, 50, 56], lashY: 572 },
  },
  mouth: { cx: 624, cy: 778, w: 30 },
}

const inside = (lens: GlassesLens, x: number, y: number) =>
  ((x - lens.cx) / lens.rx) ** 2 + ((y - lens.cy) / lens.ry) ** 2 <= 1

describe('glassesGeometry', () => {
  const glasses = glassesGeometry(geometry)

  it('centres each lens on its eye box', () => {
    expect(glasses.L.cx).toBeCloseTo(469)
    expect(glasses.L.cy).toBeCloseTo(613.5)
    expect(glasses.R.cx).toBeCloseTo(763.5)
    expect(glasses.R.cy).toBeCloseTo(612.5)
  })

  it('gives both lenses one size, a little larger than the bigger box', () => {
    expect(glasses.L.rx).toBe(glasses.R.rx)
    expect(glasses.L.ry).toBe(glasses.R.ry)
    expect(glasses.L.rx).toBeCloseTo((186 / 2) * 1.1)
    expect(glasses.L.ry).toBeCloseTo((181 / 2) * 1.06)
  })

  it('keeps every box edge midpoint and the whole iris inside its lens', () => {
    for (const side of ['L', 'R'] as const) {
      const e = geometry.eyes[side]
      const lens = glasses[side]
      for (const [x, y] of [
        [e.x, e.y + e.h / 2],
        [e.x + e.w, e.y + e.h / 2],
        [e.x + e.w / 2, e.y],
        [e.x + e.w / 2, e.y + e.h],
      ])
        expect(inside(lens, x, y)).toBe(true)
      const [cx, cy, rx, ry] = e.iris
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2
        expect(inside(lens, cx + rx * Math.cos(a), cy + ry * Math.sin(a))).toBe(
          true,
        )
      }
    }
  })

  it('leaves a gap for the bridge, which arches above the lens centres', () => {
    const gap = glasses.R.cx - glasses.R.rx - (glasses.L.cx + glasses.L.rx)
    expect(gap).toBeGreaterThan(0)
    expect(glasses.bridge.x).toBeCloseTo((469 + 763.5) / 2)
    expect(glasses.bridge.y).toBeLessThan(Math.min(glasses.L.cy, glasses.R.cy))
    expect(glasses.temple).toBeGreaterThan(0)
  })

  it('floors the rim at one device pixel at small sizes', () => {
    const big = rigScale(geometry, 1000)
    expect(rimWidth(glasses, big)).toBeCloseTo(glasses.rim)
    const tiny = rigScale(geometry, 28)
    expect(rimWidth(glasses, tiny) * tiny).toBeCloseTo(1)
  })
})

describe('RigPainter accessories', () => {
  const layers: ScaledRigLayers = {
    pixels: 56,
    k: rigScale(geometry, 56),
    base: {} as CanvasImageSource,
    eyes: {
      L: { white: {}, iris: {}, lid: {} } as never,
      R: { white: {}, iris: {}, lid: {} } as never,
    },
  }
  const record = () => {
    const calls: string[] = []
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (target, key: string) =>
        key in target ? target[key] : () => void calls.push(key),
      set: (target, key: string, value) => {
        target[key] = value
        if (key === 'fillStyle' || key === 'strokeStyle')
          calls.push(`${key}=${String(value)}`)
        return true
      },
    }) as unknown as CanvasRenderingContext2D
    return { calls, ctx }
  }
  // Eyes shut, so each eye is one ink stroke and needs no scratch canvas.
  const frame = () => ({
    ...new RigEngine().settle('neutral', 'idle'),
    openL: 0,
    openR: 0,
  })

  it('draws no glasses unless asked', () => {
    const { calls, ctx } = record()
    new RigPainter(geometry).paint(ctx, layers, frame())
    expect(calls).not.toContain('ellipse')
  })

  it('draws tinted lenses after both eyes and before the mouth', () => {
    const { calls, ctx } = record()
    new RigPainter(geometry, undefined, ['glasses']).paint(ctx, layers, frame())
    const tint = calls.findIndex((c) => c.startsWith('fillStyle=rgba(156'))
    const lastEyeStroke = calls.lastIndexOf('quadraticCurveTo', tint)
    const firstLens = calls.indexOf('ellipse')
    expect(tint).toBeGreaterThan(-1)
    expect(lastEyeStroke).toBeGreaterThan(-1)
    expect(firstLens).toBeGreaterThan(tint)
    // the tint is faint so a blink still reads through it
    const alpha = Number(/,\s*([\d.]+)\)$/.exec(calls[tint])![1])
    expect(alpha).toBeLessThanOrEqual(0.25)
    // the mouth (fillStyle = ink) comes after the lenses
    const mouth = calls.indexOf('fillStyle=#000', firstLens)
    expect(mouth).toBeGreaterThan(firstLens)
  })
})
