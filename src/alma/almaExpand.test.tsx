// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { haptic } from '../haptics'
import {
  almaMotionState,
  cancelAlmaTransition,
  clearExpandDisc,
  expandArea,
  expandMode,
  expandOrigin,
  lastExpandDisc,
  recordExpandDisc,
  setFrameScheduler,
  setIdleScheduler,
  startAlmaTransition,
  type AlmaExpandMetrics,
} from './almaExpand'
import { avatarBox, clearAvatarBoxes, recordAvatarBox } from './avatarFlight'
import {
  COLLAPSE_EASING,
  COLLAPSE_MS,
  CROSSFADE_IN_MS,
  ENTRANCE_MS,
  EXPAND_MS,
  expandTimeline,
  TOP_OUT_MS,
} from './expandMotion'
import { MascotRig } from './rig/MascotRig'

vi.mock('../haptics', () => ({ haptic: vi.fn() }))

const phone = { width: 400, height: 860 }
const discBox = { left: 176, top: 788, width: 48, height: 48 }
const navAvatar = { left: 180, top: 792, width: 40, height: 40 }
const headerAvatar = { left: 66, top: 12, width: 36, height: 36 }
const radius = Math.ceil(Math.hypot(200, 812))

interface Call {
  target: Element
  frames: Keyframe[]
  options: KeyframeAnimationOptions
  animation: { cancel: ReturnType<typeof vi.fn> }
}
let calls: Call[] = []
/** How late each new animation's clock starts (a busy first frame). */
let startLag = 0
let frames: Array<() => void> = []
const viewTransition = vi.fn()

beforeEach(() => {
  vi.useFakeTimers()
  calls = []
  startLag = 0
  frames = []
  // A fake WAAPI: `ready`, `currentTime` and `finished` follow the
  // animation's own clock, which starts `startLag` ms after creation.
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: function (
      this: Element,
      keyframes: Keyframe[],
      options: KeyframeAnimationOptions,
    ) {
      const created = Date.now()
      const lag = startLag
      let resolve!: () => void
      let reject!: (error: unknown) => void
      const finished = new Promise<void>((res, rej) => {
        resolve = res
        reject = rej
      })
      finished.catch(() => undefined)
      const total = lag + (options.delay ?? 0) + Number(options.duration ?? 0)
      const timer = setTimeout(resolve, total)
      const animation = {
        cancel: vi.fn(() => {
          clearTimeout(timer)
          reject(new Error('AbortError'))
        }),
        ready: new Promise<void>((res) => setTimeout(res, lag)),
        finished,
        get currentTime() {
          return Math.max(0, Date.now() - created - lag)
        },
      }
      calls.push({ target: this, frames: keyframes, options, animation })
      return animation
    },
  })
  ;(document as { startViewTransition?: unknown }).startViewTransition =
    viewTransition
  const root = document.createElement('div')
  root.id = 'root'
  const nav = document.createElement('span')
  nav.className = 'alma-avatar alma-avatar-flight'
  nav.setAttribute('data-alma-avatar', 'nav')
  root.append(nav)
  document.body.append(root)
  setIdleScheduler((callback) => callback())
  setFrameScheduler((callback) => {
    frames.push(callback)
    return () => {
      frames = frames.filter((frame) => frame !== callback)
    }
  })
  recordExpandDisc(discBox)
  recordAvatarBox('nav', navAvatar)
  recordAvatarBox('header', headerAvatar)
})

afterEach(() => {
  cancelAlmaTransition()
  vi.runOnlyPendingTimers()
  vi.useRealTimers()
  cleanup()
  setIdleScheduler(undefined)
  setFrameScheduler(undefined)
  clearExpandDisc()
  clearAvatarBoxes()
  document.body.innerHTML = ''
  delete (document as { startViewTransition?: unknown }).startViewTransition
  viewTransition.mockClear()
  vi.mocked(haptic).mockClear()
})

const html = () => document.documentElement
const root = () => document.getElementById('root')!
const circle = () => document.querySelector<HTMLElement>('.alma-expand-circle')
const clone = () => document.querySelector<HTMLElement>('.alma-avatar-clone')
const on = (target: Element | null) =>
  calls.filter((call) => call.target === target)
const scaleCalls = () =>
  on(circle()).filter((call) => 'transform' in call.frames[0])
const nextFrame = () => {
  const run = frames
  frames = []
  for (const frame of run) frame()
}
const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))
const animatedProperties = () =>
  new Set(
    calls.flatMap((call) =>
      call.frames.flatMap((frame) =>
        Object.keys(frame).filter((key) => key !== 'offset'),
      ),
    ),
  )
/** When an open lands: her page's fade-in, from full coverage, ends last. */
const openLandsAt = () => {
  const { coverAt } = openTimeline()
  return Math.max(EXPAND_MS, coverAt + Math.max(EXPAND_MS - coverAt, 160))
}
const openTimeline = () =>
  expandTimeline({
    direction: 'open',
    centre: { x: 200, y: 812 },
    radius,
    discRadius: 24,
    viewport: phone,
    linear: false,
  })

function start(
  direction: 'open' | 'close',
  extra: { reduced?: boolean; commit?: () => void } = {},
) {
  return startAlmaTransition({
    direction,
    reduced: extra.reduced ?? false,
    commit: extra.commit ?? vi.fn(),
    setNavMotion: vi.fn(),
    viewport: phone,
  })
}

describe('expandOrigin', () => {
  it('centres on the disc and reaches the farthest corner', () => {
    const origin = expandOrigin(discBox, phone)
    expect(origin.x).toBe(200)
    expect(origin.y).toBe(812)
    expect(origin.radius).toBe(radius)
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
    const {
      x,
      y,
      radius: r,
    } = expandOrigin({ left: 300, top: 100, width: 40, height: 40 }, phone)
    for (const [cx, cy] of [
      [0, 0],
      [phone.width, 0],
      [0, phone.height],
      [phone.width, phone.height],
    ])
      expect(Math.hypot(cx - x, cy - y)).toBeLessThanOrEqual(r)
  })

  it('ignores an empty disc box', () => {
    recordExpandDisc({ left: 0, top: 0, width: 0, height: 0 })
    expect(lastExpandDisc()).toBeUndefined()
  })
})

describe('expandMode', () => {
  it('is always the compositor overlay, never a View Transition', () => {
    expect(expandMode({ reduced: false, hasOrigin: true })).toBe('overlay')
  })

  it('crossfades under reduced motion or with no disc to grow from', () => {
    expect(expandMode({ reduced: true, hasOrigin: true })).toBe('crossfade')
    expect(expandMode({ reduced: false, hasOrigin: false })).toBe('crossfade')
  })
})

describe('open', () => {
  it('grows the circle over the receding page without a View Transition', () => {
    const timeline = openTimeline()
    expect(start('open')).toBe('overlay')
    expect(viewTransition).not.toHaveBeenCalled()
    expect(html().getAttribute('data-alma-expand')).toBe('overlay')
    expect(html().getAttribute('data-alma-expand-layer')).toBe('base')
    expect(html().style.getPropertyValue('--alma-expand-x')).toBe('200px')
    expect(almaMotionState()).toEqual({ running: true, deferHeavy: true })
    // Layers are promoted only for the run.
    expect(root().style.willChange).toBe('transform, opacity')
    expect(scaleCalls()[0].frames).toEqual([
      { transform: `scale(${timeline.scale.from})` },
      { transform: 'scale(1)' },
    ])
    expect(on(root())[0].frames).toEqual([
      { transform: 'scale(1)' },
      { transform: 'scale(0.94)' },
    ])
    expect(on(document.querySelector('.alma-expand-dim'))).toHaveLength(1)
    expect([...animatedProperties()].sort()).toEqual(['opacity', 'transform'])
  })

  it('swaps the route only once the circle covers the screen', async () => {
    const commit = vi.fn(() => {
      expect(html().getAttribute('data-alma-expand-layer')).toBe('top')
    })
    const { coverAt } = openTimeline()
    start('open', { commit })
    await advance(coverAt - 1)
    expect(commit).not.toHaveBeenCalled()
    await advance(1)
    expect(commit).toHaveBeenCalledTimes(1)
    const fadeIn = on(root()).at(-1)!
    expect(fadeIn.frames[0]).toEqual({
      opacity: 0,
      transform: 'translateY(8px)',
    })
    // The recede is dropped: nothing of the old page is left to show.
    expect(on(root())[0].animation.cancel).toHaveBeenCalled()
  })

  it('times the swap by the circle animation clock, not the wall clock', async () => {
    // The first frame lands 120 ms late (main thread busy): the circle's
    // clock starts then, and so must the wait for full coverage.
    startLag = 120
    const commit = vi.fn()
    const { coverAt } = openTimeline()
    start('open', { commit })
    await advance(coverAt)
    expect(commit).not.toHaveBeenCalled()
    await advance(119)
    expect(commit).not.toHaveBeenCalled()
    await advance(1)
    expect(commit).toHaveBeenCalledTimes(1)
  })

  it('flies a clone of her avatar to the header and hides the real ones', async () => {
    const { coverAt } = openTimeline()
    start('open', {
      commit: () => {
        const header = document.createElement('span')
        header.className = 'alma-avatar alma-avatar-flight'
        header.setAttribute('data-alma-avatar', 'header')
        header.getBoundingClientRect = () =>
          ({ left: 60, top: 18, width: 36, height: 36 }) as DOMRect
        root().append(header)
      },
    })
    expect(html().hasAttribute('data-alma-avatar-flight')).toBe(true)
    const flight = clone()!
    expect(flight.getAttribute('aria-hidden')).toBe('true')
    expect(flight.querySelector('[data-alma-avatar]')).toBeNull()
    expect(flight.querySelector('.alma-avatar')).not.toBeNull()
    expect(on(flight)[0].frames).toEqual([
      { transform: 'translate(180px, 792px)' },
      { transform: 'translate(66px, 12px) scale(0.9)' },
    ])
    expect(on(flight)[0].options.duration).toBe(EXPAND_MS)

    await advance(coverAt)
    // The real header box replaces the prediction and nudges the landing.
    expect(avatarBox('header')).toEqual({
      left: 60,
      top: 18,
      width: 36,
      height: 36,
    })
    const nudge = on(flight.querySelector('.alma-avatar-clone-face'))[0]
    expect(nudge.frames.at(-1)).toEqual({
      transform: `translate(${Number((-6 / 0.9).toFixed(4))}px, ${Number((6 / 0.9).toFixed(4))}px)`,
    })
    expect(clone()).not.toBeNull()

    await advance(EXPAND_MS)
    // Landed: the clone goes and the real avatars show in the same task.
    expect(clone()).toBeNull()
    expect(html().hasAttribute('data-alma-avatar-flight')).toBe(false)
    expect(almaMotionState().running).toBe(false)
    expect(root().style.willChange).toBe('')
    expect(circle()).toBeNull()
    expect(html().hasAttribute('data-alma-expand-layer')).toBe(false)
    expect(haptic).toHaveBeenCalledWith('selection')
  })

  it('a newer navigation cancels the run and cleans up', () => {
    start('open')
    const started = calls.length
    cancelAlmaTransition()
    expect(
      calls
        .slice(0, started)
        .every((call) => call.animation.cancel.mock.calls.length),
    ).toBe(true)
    expect(circle()).toBeNull()
    expect(clone()).toBeNull()
    expect(html().hasAttribute('data-alma-avatar-flight')).toBe(false)
    expect(almaMotionState().running).toBe(false)
  })
})

describe('close', () => {
  it('covers her page, swaps under the circle, and shrinks only after the destination painted', async () => {
    const commit = vi.fn()
    start('close', { commit })
    expect(viewTransition).not.toHaveBeenCalled()
    expect(almaMotionState().deferHeavy).toBe(false)
    expect(html().getAttribute('data-alma-expand-layer')).toBe('base')
    // The full-size circle appears over her page with a quick fade.
    const cover = on(circle())[0]
    expect(cover.frames).toEqual([{ opacity: 0 }, { opacity: 1 }])
    expect(cover.options.duration).toBeLessThanOrEqual(90)
    expect(scaleCalls()).toHaveLength(0)
    // Her avatar clone waits on the header box, the real ones hidden.
    expect(clone()!.style.transform).toBe('translate(66px, 12px)')
    expect(html().hasAttribute('data-alma-avatar-flight')).toBe(true)

    await advance(TOP_OUT_MS - 1)
    expect(commit).not.toHaveBeenCalled()
    await advance(1)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(scaleCalls()).toHaveLength(0)
    nextFrame()
    expect(scaleCalls()).toHaveLength(0)
    nextFrame()
    const shrink = scaleCalls()[0]
    expect(shrink.options.duration).toBe(COLLAPSE_MS)
    expect(shrink.options.easing).toBe(COLLAPSE_EASING)
    expect(shrink.frames.at(-1)!.transform).toBe(`scale(${24 / radius})`)
    expect(on(root())[0].frames[0]).toEqual({ transform: 'scale(0.94)' })
    expect(on(clone())[0].frames.at(-1)).toEqual({
      transform: `translate(180px, 792px) scale(${Number((40 / 36).toFixed(4))})`,
    })

    await advance(COLLAPSE_MS)
    expect(almaMotionState().running).toBe(false)
    expect(clone()).toBeNull()
    expect(html().hasAttribute('data-alma-avatar-flight')).toBe(false)
    expect(haptic).not.toHaveBeenCalled()
  })
})

describe('split layouts', () => {
  const wide = { width: 1200, height: 900 }
  const railDisc = { left: 12, top: 10, width: 48, height: 48 }
  const boxes: Record<string, Partial<DOMRect>> = {
    '.split-rail': { left: 0, top: 0, right: 72, width: 72, height: 900 },
    '.split-sidebar': { left: 72, top: 0, right: 392, width: 320 },
    '.split-main': { left: 392, top: 0, right: 1200, width: 808 },
  }

  beforeEach(() => {
    const shell = document.createElement('div')
    shell.className = 'split-shell'
    for (const selector of Object.keys(boxes)) {
      const pane = document.createElement('div')
      pane.className = selector.slice(1)
      shell.append(pane)
    }
    root().append(shell)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        const match = Object.keys(boxes).find((key) => this.matches(key))
        return {
          left: 0,
          top: 0,
          right: 0,
          width: 0,
          height: 0,
          ...(match ? boxes[match] : {}),
        } as DOMRect
      },
    )
    recordExpandDisc(railDisc)
  })

  afterEach(() =>
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockRestore(),
  )

  const pane = (name: string) =>
    document.querySelector<HTMLElement>(`.split-shell > .${name}`)!
  const startWide = (commit = vi.fn()) =>
    startAlmaTransition({
      direction: 'open',
      reduced: false,
      commit,
      setNavMotion: vi.fn(),
      viewport: wide,
    })

  it('covers everything right of the rail and leaves the rail alone', () => {
    expect(expandArea(wide, 72)).toEqual({
      left: 72,
      top: 0,
      width: 1128,
      height: 900,
    })
    expect(expandArea(wide)).toEqual({ left: 0, top: 0, ...wide })
    expect(expandArea(wide, 5000).width).toBe(0)
  })

  it('reaches every corner of the area, not the viewport, from the rail disc', () => {
    const area = expandArea(wide, 72)
    const origin = expandOrigin(railDisc, wide, area)
    expect(origin).toEqual({
      x: 36,
      y: 34,
      radius: Math.ceil(Math.hypot(1200 - 36, 900 - 34)),
    })
    for (const [cx, cy] of [
      [area.left, 0],
      [wide.width, 0],
      [area.left, wide.height],
      [wide.width, wide.height],
    ])
      expect(Math.hypot(cx - origin.x, cy - origin.y)).toBeLessThanOrEqual(
        origin.radius,
      )
  })

  it('clips the circle to the measured area and recedes only the panes', async () => {
    const commit = vi.fn()
    expect(startWide(commit)).toBe('overlay')
    const clip = document.querySelector<HTMLElement>('.alma-expand-clip')!
    expect(clip.style.left).toBe('72px')
    expect(clip.style.width).toBe('1128px')
    expect(clip.style.height).toBe('900px')
    expect(clip.contains(circle())).toBe(true)
    const r = Math.ceil(Math.hypot(1200 - 36, 900 - 34))
    // Circle coordinates are the clip's: the disc centre sits left of it.
    expect(circle()!.style.left).toBe(`${36 - 72 - r}px`)
    expect(circle()!.style.top).toBe(`${34 - r}px`)

    expect(on(root())).toHaveLength(0)
    expect(on(pane('split-rail'))).toHaveLength(0)
    for (const name of ['split-sidebar', 'split-main'])
      expect(on(pane(name))[0].frames.at(-1)).toEqual({
        transform: 'scale(0.94)',
      })
    // Each pane recedes about the disc centre, in its own box.
    expect(pane('split-sidebar').style.transformOrigin).toBe('-36px 34px')
    expect(pane('split-main').style.transformOrigin).toBe('-356px 34px')

    await advance(openLandsAt() + 1000)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(almaMotionState().running).toBe(false)
    expect(document.querySelector('.alma-expand-clip')).toBeNull()
    expect(pane('split-main').style.transformOrigin).toBe('')
    expect(pane('split-main').style.willChange).toBe('')
  })

  it('flies the rail face to the dock across the rail edge, growing 40 to 52', () => {
    startWide()
    // Centred on the rail's right edge (72 - 26) and the 60px header row.
    expect(on(clone()!)[0].frames.at(-1)).toEqual({
      transform: 'translate(46px, 4px) scale(1.3)',
    })
    expect(on(clone()!)[0].options.duration).toBe(EXPAND_MS)
  })

  it('flies back from the dock into the rail slot on close', () => {
    const dock = { left: 46, top: 4, width: 52, height: 52 }
    recordAvatarBox('header', dock)
    startAlmaTransition({
      direction: 'close',
      reduced: false,
      commit: vi.fn(),
      setNavMotion: vi.fn(),
      viewport: wide,
    })
    expect(clone()!.style.width).toBe('52px')
    expect(clone()!.style.transform).toBe('translate(46px, 4px)')
  })

  it('crossfades her docked face with the panes under reduced motion', async () => {
    const dock = document.createElement('div')
    dock.className = 'alma-dock'
    document.querySelector('.split-shell')!.append(dock)
    startAlmaTransition({
      direction: 'close',
      reduced: true,
      commit: vi.fn(),
      setNavMotion: vi.fn(),
      viewport: wide,
    })
    expect(on(dock)[0].frames).toEqual([{ opacity: 1 }, { opacity: 0 }])
    expect(on(pane('split-rail'))).toHaveLength(0)
  })
})

describe('crossfade', () => {
  it('fades out, swaps, fades in under reduced motion, with no circle or clone', async () => {
    const commit = vi.fn()
    expect(start('open', { reduced: true, commit })).toBe('crossfade')
    expect(viewTransition).not.toHaveBeenCalled()
    expect(html().hasAttribute('data-alma-expand')).toBe(false)
    expect(circle()).toBeNull()
    expect(clone()).toBeNull()
    expect(on(root())[0].frames).toEqual([{ opacity: 1 }, { opacity: 0 }])
    await advance(TOP_OUT_MS)
    expect(commit).toHaveBeenCalledTimes(1)
    const fadeIn = on(root()).at(-1)!
    expect(fadeIn.frames).toEqual([{ opacity: 0 }, { opacity: 1 }])
    expect(fadeIn.options.duration).toBe(CROSSFADE_IN_MS)
    expect(almaMotionState().deferHeavy).toBe(true)
    await advance(CROSSFADE_IN_MS)
    expect(almaMotionState().running).toBe(false)
    expect(haptic).not.toHaveBeenCalled()
  })

  it('crossfades a deep link with no disc to grow from', () => {
    clearExpandDisc()
    expect(start('close')).toBe('crossfade')
    expect(circle()).toBeNull()
  })
})

describe('deferred heavy rendering', () => {
  it('keeps the shell until the entrance has played after the finish', async () => {
    start('open')
    await advance(openLandsAt() - 1)
    expect(almaMotionState().running).toBe(true)
    await advance(1)
    // Finished, but the shell's messages are still rising.
    expect(almaMotionState()).toEqual({ running: false, deferHeavy: true })
    await advance(ENTRANCE_MS - 1)
    expect(almaMotionState().deferHeavy).toBe(true)
    await advance(1)
    expect(almaMotionState().deferHeavy).toBe(false)
  })

  it('publishes metrics for each run', async () => {
    start('open')
    const metrics = () =>
      (window as { __almaExpandMetrics?: AlmaExpandMetrics })
        .__almaExpandMetrics
    expect(metrics()).toMatchObject({ mode: 'overlay', direction: 'open' })
    expect(metrics()?.swappedAt).toBeUndefined()
    expect(metrics()?.finishedAt).toBeUndefined()
    await advance(EXPAND_MS + 200)
    expect(metrics()!.swappedAt).toBeGreaterThan(metrics()!.startedAt)
    expect(metrics()!.finishedAt).toBeGreaterThanOrEqual(metrics()!.swappedAt!)
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
    act(() => {
      start('open')
    })
    expect(canvas().dataset.running).toBe('false')
    await advance(EXPAND_MS + 200)
    expect(canvas().dataset.running).toBe('true')
  })
})
