// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  registerMascotRig,
  type MascotRigAssets,
} from '../extensions/mascotRig'
import { AlmaFace, faceRenderer } from './AlmaFace'

const eye = {
  x: 10,
  y: 20,
  w: 30,
  h: 28,
  iris: [25, 34, 6, 7] as [number, number, number, number],
  lashY: 26,
}
const rig = (base = '/rig/base'): MascotRigAssets => ({
  base,
  // Unique URLs per case: decoded images are cached by URL.
  eyes: {
    L: { white: `${base}-lw`, iris: `${base}-li`, lid: `${base}-ll` },
    R: { white: `${base}-rw`, iris: `${base}-ri`, lid: `${base}-rl` },
  },
  rig: {
    size: [100, 100],
    eyes: { L: eye, R: { ...eye, x: 60, iris: [75, 34, 6, 7] } },
    mouth: { cx: 50, cy: 70, w: 8 },
  },
})

let reduced = false
let imageOutcome: 'load' | 'error' | 'pending' = 'pending'
const calls: string[] = []

class FakeImage {
  onload?: () => void
  onerror?: () => void
  decoding = ''
  width = 30
  height = 28
  set src(value: string) {
    if (imageOutcome === 'pending') return
    queueMicrotask(() =>
      imageOutcome === 'load' ? this.onload?.() : this.onerror?.(),
    )
    void value
  }
}

beforeEach(() => {
  reduced = false
  imageOutcome = 'pending'
  calls.length = 0
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('reduce') ? reduced : false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia
  vi.stubGlobal('Image', FakeImage)
  // A recording 2D context: every method call is noted, every property set.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
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
      }) as unknown as RenderingContext,
  )
})
afterEach(() => {
  cleanup()
  registerMascotRig(undefined)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('faceRenderer', () => {
  it('uses the rig only when one is registered and has not failed', () => {
    expect(faceRenderer(false, false)).toBe('vector')
    expect(faceRenderer(true, false)).toBe('rig')
    expect(faceRenderer(true, true)).toBe('vector')
  })
})

describe('AlmaFace', () => {
  it('draws the vector face when no rig is registered', () => {
    const { container } = render(<AlmaFace size={40} mood="sad" />)
    expect(container.querySelector('svg.alma-face')).toBeTruthy()
    expect(container.querySelector('canvas')).toBeNull()
  })

  it('draws a device-pixel canvas when a rig is registered', () => {
    vi.stubGlobal('devicePixelRatio', 2.5)
    registerMascotRig(rig('/dpr/base'))
    const { container } = render(
      <AlmaFace size={40} mood="angry" activity="talking" />,
    )
    const canvas = container.querySelector('canvas.mascot-rig')!
    expect(canvas).toBeTruthy()
    expect(canvas.getAttribute('width')).toBe('100')
    expect((canvas as HTMLCanvasElement).style.width).toBe('40px')
    expect(canvas.getAttribute('aria-hidden')).toBe('true')
    expect(canvas.getAttribute('data-mood')).toBe('angry')
    expect(canvas.getAttribute('data-activity')).toBe('talking')
    expect(container.querySelector('svg')).toBeNull()
  })

  it('switches to the rig when an extension registers one late', () => {
    const { container } = render(<AlmaFace size={40} />)
    expect(container.querySelector('svg.alma-face')).toBeTruthy()
    act(() => registerMascotRig(rig('/late/base')))
    expect(container.querySelector('canvas.mascot-rig')).toBeTruthy()
  })

  it('falls back to the vector face when the art cannot load', async () => {
    imageOutcome = 'error'
    registerMascotRig(rig('/missing/base'))
    const { container } = render(<AlmaFace size={40} />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(container.querySelector('canvas')).toBeNull()
    expect(container.querySelector('svg.alma-face')).toBeTruthy()
  })

  it('falls back when the rig geometry is unusable', () => {
    const broken = rig('/broken/base')
    broken.rig = { ...broken.rig, size: [0, 0] }
    registerMascotRig(broken)
    const { container } = render(<AlmaFace size={40} />)
    expect(container.querySelector('svg.alma-face')).toBeTruthy()
  })

  it('paints one settled frame and no loop under reduced motion', async () => {
    reduced = true
    imageOutcome = 'load'
    const raf = vi.spyOn(window, 'requestAnimationFrame')
    registerMascotRig(rig('/loaded/base'))
    const { container } = render(<AlmaFace size={40} mood="happy" />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    const canvas = container.querySelector('canvas.mascot-rig')!
    expect(canvas.getAttribute('data-animated')).toBe('false')
    expect(canvas.getAttribute('data-running')).toBe('false')
    expect(calls).toContain('drawImage')
    // happy eyes are shut: the closed-lid stroke is drawn
    expect(calls).toContain('quadraticCurveTo')
    expect(raf).not.toHaveBeenCalled()
  })

  it('runs the animation loop for a live face', async () => {
    imageOutcome = 'load'
    const raf = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation(() => 1)
    registerMascotRig(rig('/live/base'))
    const { container, unmount } = render(<AlmaFace size={40} />)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(
      container.querySelector('canvas')!.getAttribute('data-running'),
    ).toBe('true')
    expect(raf).toHaveBeenCalled()
    const cancel = vi.spyOn(window, 'cancelAnimationFrame')
    unmount()
    expect(cancel).toHaveBeenCalled()
  })
})
