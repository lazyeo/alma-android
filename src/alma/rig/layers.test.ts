// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MascotRigGeometry } from '../../extensions/mascotRig'
import { RigEngine } from './engine'
import { rigOutputPixels } from './MascotRig'
import {
  RigPainter,
  paintStill,
  prepareRigLayers,
  readyRigLayers,
  rigScale,
  type RigImages,
} from './paint'

const geometry: MascotRigGeometry = {
  size: [1000, 1000],
  eyes: {
    L: { x: 300, y: 420, w: 150, h: 140, iris: [390, 500, 40, 45], lashY: 460 },
    R: { x: 540, y: 420, w: 140, h: 140, iris: [600, 500, 40, 45], lashY: 460 },
  },
  mouth: { cx: 500, cy: 620, w: 24 },
}

const source = (width: number, height: number) =>
  ({
    naturalWidth: width,
    naturalHeight: height,
  }) as unknown as HTMLImageElement
const images = (): RigImages => ({
  base: source(1000, 1000),
  eyes: {
    L: {
      white: source(150, 140),
      iris: source(150, 140),
      lid: source(150, 140),
    },
    R: {
      white: source(140, 140),
      iris: source(140, 140),
      lid: source(140, 140),
    },
  },
})

let calls: string[] = []
const context = () =>
  new Proxy({} as Record<string, unknown>, {
    get: (target, key: string) =>
      key in target
        ? target[key]
        : (...args: unknown[]) => {
            calls.push(key)
            void args
          },
    set: (target, key: string, value) => {
      target[key] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D

beforeEach(() => {
  calls = []
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => context() as unknown as RenderingContext,
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('prepareRigLayers', () => {
  it('renders every layer once per output size as a resized ImageBitmap', async () => {
    const bitmap = vi.fn(
      async (_source: unknown, options: ImageBitmapOptions) =>
        options as unknown as ImageBitmap,
    )
    vi.stubGlobal('createImageBitmap', bitmap)
    const rig = images()
    const pixels = rigOutputPixels(48, 3)
    expect(pixels).toBe(144)
    expect(readyRigLayers(rig, pixels)).toBeUndefined()
    const first = prepareRigLayers(rig, geometry, pixels)
    expect(prepareRigLayers(rig, geometry, pixels)).toBe(first)
    const layers = await first
    expect(bitmap).toHaveBeenCalledTimes(7)
    const k = rigScale(geometry, pixels)
    expect(layers.k).toBeCloseTo(k)
    expect(layers.pixels).toBe(144)
    // Sized to the device pixels they are drawn at, never the 1000px source.
    expect(bitmap).toHaveBeenCalledWith(rig.base, {
      resizeWidth: Math.ceil(1000 * k),
      resizeHeight: Math.ceil(1000 * k),
      resizeQuality: 'high',
    })
    expect(bitmap).toHaveBeenCalledWith(
      rig.eyes.L.white,
      expect.objectContaining({ resizeWidth: Math.ceil(150 * k) }),
    )
    expect(readyRigLayers(rig, pixels)).toBe(layers)

    // Another size is its own bucket; the first is reused untouched.
    const header = await prepareRigLayers(rig, geometry, rigOutputPixels(36, 3))
    expect(header.pixels).toBe(108)
    expect(bitmap).toHaveBeenCalledTimes(14)
    expect(readyRigLayers(rig, 144)).toBe(layers)
  })

  it('falls back to a canvas resample without createImageBitmap', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    const layers = await prepareRigLayers(images(), geometry, 96)
    expect(layers.base).toBeInstanceOf(HTMLCanvasElement)
    expect((layers.base as HTMLCanvasElement).width).toBe(
      Math.ceil(1000 * rigScale(geometry, 96)),
    )
  })
})

describe('paintStill', () => {
  it('composites a static face once per expression and reuses the bitmap', async () => {
    vi.stubGlobal('createImageBitmap', undefined)
    const layers = await prepareRigLayers(images(), geometry, 84)
    const painter = new RigPainter(geometry)
    const frame = vi.fn(() => new RigEngine().settle('happy', 'idle'))
    calls = []
    paintStill(context(), painter, layers, 'happy|idle', frame)
    const composited = calls.length
    expect(frame).toHaveBeenCalledTimes(1)
    expect(composited).toBeGreaterThan(5)

    calls = []
    paintStill(context(), painter, layers, 'happy|idle', frame)
    expect(frame).toHaveBeenCalledTimes(1)
    expect(calls).toEqual(['setTransform', 'clearRect', 'drawImage'])

    paintStill(context(), painter, layers, 'sad|idle', frame)
    expect(frame).toHaveBeenCalledTimes(2)
  })
})
