// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { haptic } from '../haptics'
import {
  almaMotionState,
  cancelAlmaTransition,
  clearExpandDisc,
  expandMode,
  expandOrigin,
  lastExpandDisc,
  recordExpandDisc,
  setIdleScheduler,
  startAlmaTransition,
  type AlmaExpandMetrics,
  type ViewTransitionLike,
} from './almaExpand'
import {
  COLLAPSE_MS,
  ENTRANCE_MS,
  EXPAND_MS,
  expandTimeline,
  TOP_OUT_MS,
} from './expandMotion'
import { MascotRig } from './rig/MascotRig'

vi.mock('../haptics', () => ({ haptic: vi.fn() }))

const phone = { width: 400, height: 860 }
const discBox = { left: 176, top: 788, width: 48, height: 48 }

interface Call {
  target: Element
  frames: Keyframe[]
  options: KeyframeAnimationOptions
  animation: { cancel: ReturnType<typeof vi.fn> }
}
let calls: Call[] = []

beforeEach(() => {
  vi.useFakeTimers()
  calls = []
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: function (
      this: Element,
      frames: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      const animation = { cancel: vi.fn() }
      calls.push({ target: this, frames, options, animation })
      return animation
    },
  })
  const root = document.createElement('div')
  root.id = 'root'
  document.body.append(root)
  setIdleScheduler((callback) => callback())
  recordExpandDisc(discBox)
})

afterEach(() => {
  cancelAlmaTransition()
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  cleanup()
  setIdleScheduler(undefined)
  clearExpandDisc()
  document.body.innerHTML = ''
  vi.mocked(haptic).mockClear()
})

const html = () => document.documentElement
const flush = () => act(async () => {})

function fakeViewTransition() {
  let update: (() => void) | undefined
  let resolveReady!: () => void
  let resolveFinished!: () => void
  const transition: ViewTransitionLike = {
    ready: new Promise<void>((resolve) => (resolveReady = resolve)),
    finished: new Promise<void>((resolve) => (resolveFinished = resolve)),
    skipTransition: vi.fn(),
  }
  const start = vi.fn((callback: () => void) => {
    update = callback
    return transition
  })
  return {
    start,
    /** The browser captured the old page: run the update, build pseudos. */
    async capture() {
      update!()
      resolveReady()
      await flush()
    },
    async end() {
      resolveFinished()
      await flush()
    },
  }
}

const pseudoCalls = () => calls.filter((call) => call.options.pseudoElement)
const onPseudo = (name: string) =>
  pseudoCalls().filter((call) => call.options.pseudoElement === name)
const animatedProperties = () =>
  new Set(
    calls.flatMap((call) =>
      call.frames.flatMap((frame) =>
        Object.keys(frame).filter((key) => key !== 'offset'),
      ),
    ),
  )

describe('expandOrigin', () => {
  it('centres on the disc and reaches the farthest corner', () => {
    const origin = expandOrigin(discBox, phone)
    expect(origin.x).toBe(200)
    expect(origin.y).toBe(812)
    expect(origin.radius).toBe(Math.ceil(Math.hypot(200, 812)))
  })

  it('picks the far side for an off-centre rail disc', () => {
    expect(
      expandOrigin(
        { left: 10, top: 10, width: 44, height: 44 },
        { width: 1200, height: 900 },
      ),
    ).toEqual({
      x: 32,
      y: 32,
      radius: Math.ceil(Math.hypot(1200 - 32, 900 - 32)),
    })
  })

  it('covers every corner of the viewport', () => {
    const { x, y, radius } = expandOrigin(
      { left: 300, top: 100, width: 40, height: 40 },
      phone,
    )
    for (const [cx, cy] of [
      [0, 0],
      [phone.width, 0],
      [0, phone.height],
      [phone.width, phone.height],
    ])
      expect(Math.hypot(cx - x, cy - y)).toBeLessThanOrEqual(radius)
  })

  it('ignores an empty disc box', () => {
    recordExpandDisc({ left: 0, top: 0, width: 0, height: 0 })
    expect(lastExpandDisc()).toBeUndefined()
  })
})

describe('expandMode', () => {
  it('reveals with View Transitions and overlays without them', () => {
    expect(
      expandMode({ reduced: false, viewTransitions: true, hasOrigin: true }),
    ).toBe('reveal')
    expect(
      expandMode({ reduced: false, viewTransitions: false, hasOrigin: true }),
    ).toBe('overlay')
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

describe('reveal (View Transitions)', () => {
  it('captures the base page, commits her page as the top layer and animates pseudos', async () => {
    const vt = fakeViewTransition()
    const commit = vi.fn(() => {
      expect(html().getAttribute('data-alma-expand-layer')).toBe('top')
    })
    const setNavMotion = vi.fn()
    const mode = startAlmaTransition({
      direction: 'open',
      reduced: false,
      commit,
      startViewTransition: vt.start,
      setNavMotion,
      viewport: phone,
    })
    expect(mode).toBe('reveal')
    expect(setNavMotion).toHaveBeenCalledWith('alma')
    expect(html().getAttribute('data-alma-expand')).toBe('reveal')
    expect(html().getAttribute('data-alma-expand-layer')).toBe('base')
    expect(html().style.getPropertyValue('--alma-expand-x')).toBe('200px')
    expect(document.querySelector('.alma-expand-circle')).not.toBeNull()
    // Unpainted: the group carries the paint, nothing big is captured.
    expect(
      document.querySelector<HTMLElement>('.alma-expand-circle')!.dataset.paint,
    ).toBeUndefined()
    expect(almaMotionState()).toEqual({ running: true, deferHeavy: true })
    expect(commit).not.toHaveBeenCalled()

    await vt.capture()
    expect(commit).toHaveBeenCalledTimes(1)

    const timeline = expandTimeline({
      direction: 'open',
      centre: { x: 200, y: 812 },
      radius: Math.ceil(Math.hypot(200, 812)),
      discRadius: 24,
      viewport: phone,
      linear: false,
    })
    const circle = onPseudo('::view-transition-group(alma-expand-circle)')
    const scale = circle.find((call) => 'transform' in call.frames[0])!
    expect(scale.options.duration).toBe(EXPAND_MS)
    expect(scale.frames[0].transform).toContain(`scale(${timeline.scale.from})`)
    expect(scale.frames[1].transform).toContain('scale(1)')
    const top = onPseudo('::view-transition-new(alma-expand-top)')[0]
    expect(top.options.delay).toBe(timeline.fadeAt)
    expect(top.options.fill).toBe('both')
    expect(
      onPseudo('::view-transition-old(alma-expand-base)')[0].frames.at(-1),
    ).toEqual({ transform: 'scale(0.94)' })
    expect(onPseudo('::view-transition-group(alma-expand-dim)')).toHaveLength(1)
    expect([...animatedProperties()].sort()).toEqual(['opacity', 'transform'])

    await vt.end()
    expect(html().hasAttribute('data-alma-expand')).toBe(false)
    expect(html().hasAttribute('data-alma-motion')).toBe(false)
    expect(document.querySelector('.alma-expand-circle')).toBeNull()
    expect(setNavMotion).toHaveBeenLastCalledWith('none')
    expect(haptic).toHaveBeenCalledWith('selection')
  })

  it('collapses: her page is the old top layer and the circle shrinks into the disc', async () => {
    const vt = fakeViewTransition()
    const commit = vi.fn()
    startAlmaTransition({
      direction: 'close',
      reduced: false,
      commit,
      startViewTransition: vt.start,
      setNavMotion: vi.fn(),
      viewport: phone,
    })
    expect(html().getAttribute('data-alma-expand-layer')).toBe('top')
    expect(almaMotionState().deferHeavy).toBe(false)
    await vt.capture()
    expect(html().getAttribute('data-alma-expand-layer')).toBe('base')
    const fade = onPseudo('::view-transition-old(alma-expand-top)')[0]
    expect(fade.options.duration).toBe(TOP_OUT_MS)
    expect(fade.frames).toEqual([{ opacity: 1 }, { opacity: 0 }])
    const shrink = onPseudo('::view-transition-group(alma-expand-circle)').find(
      (call) => 'transform' in call.frames[0],
    )!
    expect(shrink.options.duration).toBe(COLLAPSE_MS)
    expect(shrink.options.easing).toBe('cubic-bezier(0.4, 0, 1, 1)')
    expect(shrink.frames[1].transform).toContain(
      `scale(${24 / Math.ceil(Math.hypot(200, 812))})`,
    )
    expect(
      onPseudo('::view-transition-new(alma-expand-base)')[0].frames[0],
    ).toEqual({ transform: 'scale(0.94)' })
    await vt.end()
    expect(haptic).not.toHaveBeenCalled()
  })
})

describe('overlay (no View Transitions)', () => {
  it('swaps pages under the covering circle, then fades her page in', () => {
    const commit = vi.fn()
    const timeline = expandTimeline({
      direction: 'open',
      centre: { x: 200, y: 812 },
      radius: Math.ceil(Math.hypot(200, 812)),
      discRadius: 24,
      viewport: phone,
      linear: false,
    })
    expect(
      startAlmaTransition({
        direction: 'open',
        reduced: false,
        commit,
        setNavMotion: vi.fn(),
        viewport: phone,
      }),
    ).toBe('overlay')
    const root = document.getElementById('root')!
    const circle = document.querySelector<HTMLElement>('.alma-expand-circle')!
    expect(circle.dataset.paint).toBe('true')
    // Layers are promoted only for the run.
    expect(root.style.willChange).toBe('transform, opacity')
    expect(calls.filter((call) => call.target === circle)[0].frames).toEqual([
      { transform: `scale(${timeline.scale.from})` },
      { transform: 'scale(1)' },
    ])
    expect(calls.find((call) => call.target === root)!.frames).toEqual([
      { transform: 'scale(1)' },
      { transform: 'scale(0.94)' },
    ])

    vi.advanceTimersByTime(timeline.coverAt - 1)
    expect(commit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(html().getAttribute('data-alma-expand-layer')).toBe('top')
    const fadeIn = calls.filter((call) => call.target === root).at(-1)!
    expect(fadeIn.frames[0]).toEqual({
      opacity: 0,
      transform: 'translateY(8px)',
    })
    expect([...animatedProperties()].sort()).toEqual(['opacity', 'transform'])

    vi.advanceTimersByTime(EXPAND_MS)
    expect(almaMotionState().running).toBe(false)
    expect(root.style.willChange).toBe('')
    expect(document.querySelector('.alma-expand-circle')).toBeNull()
    expect(html().hasAttribute('data-alma-expand-layer')).toBe(false)
  })

  it('collapses: her page fades out before the destination commits', () => {
    const commit = vi.fn()
    startAlmaTransition({
      direction: 'close',
      reduced: false,
      commit,
      setNavMotion: vi.fn(),
      viewport: phone,
    })
    vi.advanceTimersByTime(TOP_OUT_MS - 1)
    expect(commit).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(html().getAttribute('data-alma-expand-layer')).toBe('base')
    vi.advanceTimersByTime(COLLAPSE_MS)
    expect(almaMotionState().running).toBe(false)
  })

  it('a newer navigation cancels the run and cleans up', () => {
    startAlmaTransition({
      direction: 'open',
      reduced: false,
      commit: vi.fn(),
      setNavMotion: vi.fn(),
      viewport: phone,
    })
    const started = calls.length
    cancelAlmaTransition()
    expect(
      calls
        .slice(0, started)
        .every((call) => call.animation.cancel.mock.calls.length),
    ).toBe(true)
    expect(document.querySelector('.alma-expand-circle')).toBeNull()
    expect(almaMotionState().running).toBe(false)
  })
})

describe('reduced motion', () => {
  it('crossfades with no circle, scrim or scale, and still defers heavy work', async () => {
    const vt = fakeViewTransition()
    const commit = vi.fn()
    const setNavMotion = vi.fn()
    expect(
      startAlmaTransition({
        direction: 'open',
        reduced: true,
        commit,
        startViewTransition: vt.start,
        setNavMotion,
        viewport: phone,
      }),
    ).toBe('crossfade')
    expect(setNavMotion).toHaveBeenCalledWith('fade')
    expect(html().hasAttribute('data-alma-expand')).toBe(false)
    expect(document.querySelector('.alma-expand-circle')).toBeNull()
    await vt.capture()
    expect(commit).toHaveBeenCalledTimes(1)
    expect(calls).toHaveLength(0)
    expect(almaMotionState().deferHeavy).toBe(true)
    await vt.end()
    expect(almaMotionState().running).toBe(false)
    expect(haptic).not.toHaveBeenCalled()
  })

  it('commits at once without View Transitions', () => {
    const commit = vi.fn()
    startAlmaTransition({
      direction: 'open',
      reduced: true,
      commit,
      setNavMotion: vi.fn(),
      viewport: phone,
    })
    expect(commit).toHaveBeenCalledTimes(1)
    expect(almaMotionState().running).toBe(false)
  })
})

describe('deferred heavy rendering', () => {
  it('keeps the shell until the entrance has played after the finish', async () => {
    const vt = fakeViewTransition()
    startAlmaTransition({
      direction: 'open',
      reduced: false,
      commit: vi.fn(),
      startViewTransition: vt.start,
      setNavMotion: vi.fn(),
      viewport: phone,
    })
    await vt.capture()
    expect(almaMotionState().deferHeavy).toBe(true)
    await vt.end()
    // Finished, but the shell's messages are still rising.
    expect(almaMotionState()).toEqual({ running: false, deferHeavy: true })
    vi.advanceTimersByTime(ENTRANCE_MS - 1)
    expect(almaMotionState().deferHeavy).toBe(true)
    vi.advanceTimersByTime(1)
    expect(almaMotionState().deferHeavy).toBe(false)
  })

  it('publishes metrics for each run', async () => {
    const vt = fakeViewTransition()
    startAlmaTransition({
      direction: 'open',
      reduced: false,
      commit: vi.fn(),
      startViewTransition: vt.start,
      setNavMotion: vi.fn(),
      viewport: phone,
    })
    const metrics = () =>
      (window as { __almaExpandMetrics?: AlmaExpandMetrics })
        .__almaExpandMetrics
    expect(metrics()).toMatchObject({ mode: 'reveal', direction: 'open' })
    expect(metrics()?.finishedAt).toBeUndefined()
    await vt.capture()
    await vt.end()
    expect(metrics()!.finishedAt).toBeGreaterThanOrEqual(metrics()!.startedAt)
  })
})

describe('mascot rig during the transition', () => {
  it('stops animating while the expand runs and resumes after', async () => {
    const assets = {
      base: 'base.png',
      eyes: {
        L: { white: 'w', iris: 'i', lid: 'l' },
        R: { white: 'w', iris: 'i', lid: 'l' },
      },
      rig: {},
    } as unknown as Parameters<typeof MascotRig>[0]['assets']
    const { container } = render(<MascotRig assets={assets} size={48} />)
    const canvas = () => container.querySelector('canvas')!
    expect(canvas().dataset.running).toBe('true')
    const vt = fakeViewTransition()
    act(() => {
      startAlmaTransition({
        direction: 'open',
        reduced: false,
        commit: vi.fn(),
        startViewTransition: vt.start,
        setNavMotion: vi.fn(),
        viewport: phone,
      })
    })
    expect(canvas().dataset.running).toBe('false')
    await vt.capture()
    expect(canvas().dataset.running).toBe('false')
    await vt.end()
    expect(canvas().dataset.running).toBe('true')
  })
})
