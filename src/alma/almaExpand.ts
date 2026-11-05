/**
 * The whole-screen expand into /alma: a circle of her page colour grows out
 * of the avatar disc while the page behind recedes, then her page fades in
 * on top; Back shrinks it into the disc again. The router decides *that*
 * Alma is entered or left; this module decides where the circle starts,
 * which variant runs, and keeps the main thread quiet while it does.
 *
 * No View Transitions: they are render-blocking, so the browser had to lay
 * out and paint the destination before the first animation frame (a
 * 120–180 ms frozen frame on a 120 Hz phone). Instead the circle, scrim,
 * receding page and a clone of her avatar are real elements animated with
 * WAAPI `transform` and `opacity`, which the compositor runs on its own
 * while the main thread is busy. The route only swaps under a circle that
 * fully covers the screen, so that work is never seen.
 */
import { useSyncExternalStore } from 'react'
import { haptic } from '../haptics'
import {
  AVATAR_FLIGHT_ATTRIBUTE,
  avatarBox,
  avatarClone,
  avatarElement,
  correctionFrames,
  flightFrames,
  headerAvatarTarget,
  recordAvatarBox,
  type Box,
} from './avatarFlight'
import {
  circleFrames,
  CIRCLE_IN_MS,
  CIRCLE_OUT_MS,
  COLLAPSE_EASING,
  CROSSFADE_IN_MS,
  dimFrames,
  ENTRANCE_MS,
  expandTimeline,
  FADE_EASING,
  recedeFrames,
  supportsLinearEasing,
  TOP_OUT_MS,
  topFrames,
  type ExpandDirection,
  type ExpandTimeline,
} from './expandMotion'

export type { ExpandDirection } from './expandMotion'
export type { Box } from './avatarFlight'

export interface Viewport {
  width: number
  height: number
}

export interface ExpandOrigin {
  /** Disc centre in viewport pixels. */
  x: number
  y: number
  /** Radius that covers the farthest viewport corner from the centre. */
  radius: number
}

/**
 * - `overlay`: the circle, scrim and avatar clone are real elements over
 *   #root and the pages swap under the fully covering circle.
 * - `crossfade`: reduced motion, or no disc to grow from: the page fades
 *   out, the route swaps, the new page fades in.
 */
export type ExpandMode = 'overlay' | 'crossfade'

/**
 * What the expand covers and her page fills: the whole viewport on a phone;
 * on split layouts everything right of the rail (`railRight`), which stays
 * in place with her face in its top slot.
 */
export function expandArea(viewport: Viewport, railRight = 0): Box {
  const left = Math.min(Math.max(0, railRight), viewport.width)
  return { left, top: 0, width: viewport.width - left, height: viewport.height }
}

/** The area for the current layout: right of `.split-rail` when shown. */
function currentExpandArea(viewport: Viewport): Box {
  const rail =
    typeof document === 'undefined'
      ? null
      : document.querySelector('.split-rail')
  return expandArea(viewport, rail?.getBoundingClientRect().right ?? 0)
}

/**
 * Circle origin for a disc box; the radius always reaches every corner of
 * `area` (the viewport unless given).
 */
export function expandOrigin(
  disc: Box,
  viewport: Viewport,
  area: Box = expandArea(viewport),
): ExpandOrigin {
  const x = disc.left + disc.width / 2
  const y = disc.top + disc.height / 2
  const dx = Math.max(
    Math.abs(x - area.left),
    Math.abs(area.left + area.width - x),
  )
  const dy = Math.max(
    Math.abs(y - area.top),
    Math.abs(area.top + area.height - y),
  )
  return { x, y, radius: Math.ceil(Math.hypot(dx, dy)) }
}

/** View Transitions play no part: both motions are compositor overlays. */
export function expandMode({
  reduced,
  hasOrigin,
}: {
  reduced: boolean
  hasOrigin: boolean
}): ExpandMode {
  return reduced || !hasOrigin ? 'crossfade' : 'overlay'
}

// The disc's last on-screen box, kept current by the nav button's
// ResizeObserver (never measured in the tap); close reuses it so the circle
// shrinks back into the same disc the user left from.
let disc: Box | undefined

export function recordExpandDisc(box: Box) {
  disc = box.width && box.height ? box : undefined
}

export function lastExpandDisc() {
  return disc
}

export function clearExpandDisc() {
  disc = undefined
}

// ---------------------------------------------------------------------------
// Run state shared with AlmaScreen (shell vs full) and the mascot rig.

export interface AlmaMotionState {
  /** An expand, collapse or crossfade is on screen: no live animation. */
  running: boolean
  /** /alma renders its cheap shell until the entrance has played. */
  deferHeavy: boolean
}

let state: AlmaMotionState = { running: false, deferHeavy: false }
const listeners = new Set<() => void>()

function setMotionState(next: Partial<AlmaMotionState>) {
  const merged = { ...state, ...next }
  if (
    merged.running === state.running &&
    merged.deferHeavy === state.deferHeavy
  )
    return
  state = merged
  for (const listener of listeners) listener()
}

export function almaMotionState() {
  return state
}

export function subscribeAlmaMotion(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useAlmaMotionRunning() {
  return useSyncExternalStore(
    subscribeAlmaMotion,
    () => state.running,
    () => false,
  )
}

export function useAlmaDeferHeavy() {
  return useSyncExternalStore(
    subscribeAlmaMotion,
    () => state.deferHeavy,
    () => false,
  )
}

type IdleScheduler = (callback: () => void) => void

const browserIdle: IdleScheduler = (callback) => {
  const request = (
    globalThis as {
      requestIdleCallback?: (
        callback: () => void,
        options?: { timeout: number },
      ) => number
    }
  ).requestIdleCallback
  if (typeof request === 'function') request(callback, { timeout: 300 })
  else setTimeout(callback, 0)
}

let idleScheduler: IdleScheduler = browserIdle
let heavyTimer: ReturnType<typeof setTimeout> | undefined
let heavyToken = 0

/** Tests swap the idle callback for a synchronous one. */
export function setIdleScheduler(scheduler: IdleScheduler | undefined) {
  idleScheduler = scheduler ?? browserIdle
}

/**
 * Full message rendering waits for the shell's entrance to finish playing
 * and then for an idle slot, so it never lands on an animating frame.
 */
function scheduleHeavy(delay: number) {
  clearTimeout(heavyTimer)
  const token = ++heavyToken
  heavyTimer = setTimeout(() => {
    idleScheduler(() => {
      if (token === heavyToken) setMotionState({ deferHeavy: false })
    })
  }, delay)
}

// ---------------------------------------------------------------------------
// Measurement hook: `window.__almaExpandMetrics`, dev builds or opt-in only.

export interface AlmaExpandMetrics {
  mode: ExpandMode
  direction: ExpandDirection
  startedAt: number
  /** When the route swapped (under the covering circle, or between fades). */
  swappedAt?: number
  finishedAt?: number
}

const DEBUG_FLAG = 'alma.debug.motion'

export function motionDebugEnabled() {
  if (import.meta.env.DEV) return true
  try {
    return localStorage.getItem(DEBUG_FLAG) === '1'
  } catch {
    return false
  }
}

function publishMetrics(metrics: AlmaExpandMetrics) {
  if (!motionDebugEnabled()) return
  ;(window as { __almaExpandMetrics?: AlmaExpandMetrics }).__almaExpandMetrics =
    { ...metrics }
}

const now = () =>
  typeof performance !== 'undefined' ? performance.now() : Date.now()

// ---------------------------------------------------------------------------
// Orchestration.

export interface AlmaTransitionOptions {
  direction: ExpandDirection
  reduced: boolean
  /** Synchronously renders the destination route. */
  commit(): void
  /** Clears `data-nav-motion`: no View Transition style applies to Alma. */
  setNavMotion(motion: 'none'): void
  viewport?: Viewport
  /** What the circle covers; measured from the split rail when omitted. */
  area?: Box
  html?: HTMLElement
}

const MOTION = 'data-alma-motion'
const EXPAND = 'data-alma-expand'
const LAYER = 'data-alma-expand-layer'
const ORIGIN_X = '--alma-expand-x'
const ORIGIN_Y = '--alma-expand-y'
const CLIP = 'alma-expand-clip'
const CIRCLE = 'alma-expand-circle'
const DIM = 'alma-expand-dim'
/** On split layouts the panes right of the rail recede and fade, not #root. */
const STAGE = '.split-shell > .split-sidebar, .split-shell > .split-main'
/** Open: shortest fade of her page in over the covering circle. */
const MIN_TOP_IN_MS = 160

type FrameScheduler = (callback: () => void) => () => void

const browserFrame: FrameScheduler = (callback) => {
  if (typeof requestAnimationFrame !== 'function') {
    const timer = setTimeout(callback, 16)
    return () => clearTimeout(timer)
  }
  const handle = requestAnimationFrame(() => callback())
  return () => cancelAnimationFrame(handle)
}

let frameScheduler: FrameScheduler = browserFrame

/** Tests drive animation frames by hand. */
export function setFrameScheduler(scheduler: FrameScheduler | undefined) {
  frameScheduler = scheduler ?? browserFrame
}

let active: { cancel(): void } | undefined

/** Ends any running expand at once (a newer navigation took over). */
export function cancelAlmaTransition() {
  active?.cancel()
  active = undefined
}

function layerElement(className: string) {
  const element = document.createElement('div')
  element.className = className
  element.setAttribute('aria-hidden', 'true')
  return element
}

/** Placed in the clip, whose top-left corner is the area's. */
function circleElement(origin: ExpandOrigin, area: Box) {
  const element = layerElement(CIRCLE)
  const size = `${origin.radius * 2}px`
  Object.assign(element.style, {
    left: `${origin.x - area.left - origin.radius}px`,
    top: `${origin.y - area.top - origin.radius}px`,
    width: size,
    height: size,
  })
  return element
}

/** A fixed box over exactly the area: the circle and scrim never leave it. */
function clipElement(area: Box) {
  const element = layerElement(CLIP)
  Object.assign(element.style, {
    left: `${area.left}px`,
    top: `${area.top}px`,
    width: `${area.width}px`,
    height: `${area.height}px`,
  })
  return element
}

/** What one run's phases share; everything registered is undone by finish. */
interface Run {
  html: HTMLElement
  root: HTMLElement
  /** What the circle covers and her page fills. */
  area: Box
  /**
   * What recedes and fades: #root on a phone; on split layouts the panes
   * right of the rail, queried when called, so the rail never moves.
   */
  stage(): HTMLElement[]
  /** Pins each stage element's transform origin on the disc centre. */
  pinOrigin(elements: HTMLElement[], origin: ExpandOrigin): void
  isDone(): boolean
  animate(
    element: HTMLElement,
    frames: Keyframe[],
    timing: KeyframeAnimationOptions,
  ): Animation
  /** Once every animation has finished (on the compositor's clock). */
  onFinished(
    animations: Array<Animation | undefined>,
    callback: () => void,
  ): void
  /** When `animation` has played `at` ms, by its own clock, not the wall's. */
  atTime(animation: Animation, at: number, callback: () => void): void
  /** After two animation frames: the destination has painted. */
  afterPaint(callback: () => void): void
  onCleanup(cleanup: () => void): void
  swap(): void
  finish(landed: boolean): void
}

/**
 * Runs the transition for one Alma navigation and returns the variant.
 * The caller must not commit the route itself: this calls `commit` once
 * nothing of the old page can be seen (under the covering circle, or
 * between the crossfade's two halves).
 */
export function startAlmaTransition(
  options: AlmaTransitionOptions,
): ExpandMode {
  cancelAlmaTransition()
  const html = options.html ?? document.documentElement
  const root = document.getElementById('root') ?? document.body
  const viewport = options.viewport ?? {
    width: window.innerWidth,
    height: window.innerHeight,
  }
  const area = options.area ?? currentExpandArea(viewport)
  const split = area.left > 0
  const box = lastExpandDisc()
  const mode = expandMode({ reduced: options.reduced, hasOrigin: Boolean(box) })
  const { direction } = options
  const metrics: AlmaExpandMetrics = { mode, direction, startedAt: now() }
  publishMetrics(metrics)
  options.setNavMotion('none')

  // Her page mounts as a cheap shell; the full thread waits for the landing.
  setMotionState({
    running: true,
    deferHeavy: direction === 'open' ? true : state.deferHeavy,
  })
  html.setAttribute(MOTION, direction)

  const animations: Animation[] = []
  const cleanups: Array<() => void> = []
  let done = false
  const finish = (landed: boolean) => {
    if (done) return
    done = true
    if (active === handle) active = undefined
    for (const animation of animations.splice(0)) animation.cancel()
    for (const cleanup of cleanups.splice(0)) cleanup()
    html.removeAttribute(MOTION)
    html.removeAttribute(EXPAND)
    html.removeAttribute(LAYER)
    html.style.removeProperty(ORIGIN_X)
    html.style.removeProperty(ORIGIN_Y)
    setMotionState({ running: false })
    if (state.deferHeavy) scheduleHeavy(landed ? ENTRANCE_MS : 0)
    if (landed && direction === 'open' && mode !== 'crossfade')
      void haptic('selection')
    metrics.finishedAt = now()
    publishMetrics(metrics)
  }
  const handle = { cancel: () => finish(false) }
  active = handle

  const after = (ms: number, callback: () => void) => {
    const timer = setTimeout(callback, ms)
    cleanups.push(() => clearTimeout(timer))
  }
  const pinned = new Set<HTMLElement>()
  cleanups.push(() => {
    for (const element of pinned)
      element.style.removeProperty('transform-origin')
  })
  const run: Run = {
    html,
    root,
    area,
    stage: () =>
      split ? [...document.querySelectorAll<HTMLElement>(STAGE)] : [root],
    pinOrigin(elements, origin) {
      // #root uses --alma-expand-x/y; the panes need it in their own box.
      if (!split) return
      for (const element of elements) {
        const box = element.getBoundingClientRect()
        element.style.transformOrigin = `${origin.x - box.left}px ${origin.y - box.top}px`
        pinned.add(element)
      }
    },
    isDone: () => done,
    animate(element, frames, timing) {
      const animation = element.animate(frames, { fill: 'both', ...timing })
      animations.push(animation)
      return animation
    },
    onFinished(list, callback) {
      void Promise.all(
        list.flatMap((animation) => (animation ? [animation.finished] : [])),
      ).then(
        () => {
          if (!done) callback()
        },
        // Cancelled: the run is over or a newer phase took over.
        () => undefined,
      )
    },
    atTime(animation, at, callback) {
      const check = () => {
        if (done) return
        const played = Number(animation.currentTime ?? 0)
        if (played >= at) callback()
        else after(Math.max(1, Math.ceil(at - played)), check)
      }
      void animation.ready.then(check, () => undefined)
    },
    afterPaint(callback) {
      let cancel = frameScheduler(() => {
        cancel = frameScheduler(() => {
          if (!done) callback()
        })
      })
      cleanups.push(() => cancel())
    },
    onCleanup(cleanup) {
      cleanups.push(cleanup)
    },
    swap() {
      options.commit()
      metrics.swappedAt = now()
      publishMetrics(metrics)
    },
    finish,
  }

  if (typeof root.animate !== 'function') {
    // No WAAPI at all: nothing can animate off the main thread.
    run.swap()
    finish(true)
    return mode
  }
  if (mode === 'crossfade' || !box) {
    runCrossfade(run)
    return mode
  }

  const origin = expandOrigin(box, viewport, area)
  const timeline = expandTimeline({
    direction,
    // Coverage is measured over the area, in its own coordinates.
    centre: { x: origin.x - area.left, y: origin.y - area.top },
    radius: origin.radius,
    discRadius: box.width / 2,
    viewport: { width: area.width, height: area.height },
    linear: supportsLinearEasing(),
  })
  html.style.setProperty(ORIGIN_X, `${origin.x}px`)
  html.style.setProperty(ORIGIN_Y, `${origin.y}px`)
  html.setAttribute(EXPAND, mode)
  if (direction === 'open') runOpen(run, origin, timeline)
  else runClose(run, origin, timeline)
  return mode
}

/** Old page out, swap on a blank frame, new page in: opacity only. */
function runCrossfade(run: Run) {
  const out = run.stage().map((element) =>
    run.animate(element, [{ opacity: 1 }, { opacity: 0 }], {
      duration: TOP_OUT_MS,
      easing: FADE_EASING,
    }),
  )
  run.onFinished(out, () => {
    run.swap()
    // Created before `out` is dropped, so no frame shows the page at 1.
    const fadeIn = run.stage().map((element) =>
      run.animate(element, [{ opacity: 0 }, { opacity: 1 }], {
        duration: CROSSFADE_IN_MS,
        easing: FADE_EASING,
      }),
    )
    for (const animation of out) animation.cancel()
    run.onFinished(fadeIn, () => run.finish(true))
  })
}

/**
 * Circle and scrim as real elements in a clip over the area, promoted only
 * for the run. The clip sits between #root's base and top layers.
 */
function overlayLayers(run: Run, origin: ExpandOrigin) {
  const clip = clipElement(run.area)
  const circle = circleElement(origin, run.area)
  const dim = layerElement(DIM)
  dim.style.opacity = '0'
  clip.append(dim, circle)
  const promoted = [...run.stage(), circle, dim]
  for (const layer of promoted) layer.style.willChange = 'transform, opacity'
  document.body.append(clip)
  run.onCleanup(() => {
    for (const layer of promoted) layer.style.removeProperty('will-change')
    clip.remove()
  })
  return { circle, dim }
}

/** The stage receding (open) or returning (close) about the disc centre. */
function recedeStage(
  run: Run,
  origin: ExpandOrigin,
  direction: ExpandDirection,
  timing: KeyframeAnimationOptions,
) {
  const stage = run.stage()
  run.pinOrigin(stage, origin)
  return stage.map((element) =>
    run.animate(element, recedeFrames(direction), timing),
  )
}

interface AvatarFlight {
  /** Starts the clone's flight (it sits on `from` until then). */
  launch(timing: { duration: number; easing: string }): Animation
  /** Open: nudges the landing onto the header's real box, once known. */
  retarget(actual: Box): void
}

/**
 * The avatar clone, sitting on `from` from the first frame with both real
 * avatars hidden; it is removed in the same task that shows them again.
 */
function avatarFlight(
  run: Run,
  from: Box | undefined,
  to: Box,
  source: Element | null,
): AvatarFlight | undefined {
  const frames = from && flightFrames(from, to)
  if (!from || !frames) return undefined
  const { flight, face } = avatarClone(source, from)
  flight.style.transform = String(frames[0].transform)
  document.body.append(flight)
  run.html.setAttribute(AVATAR_FLIGHT_ATTRIBUTE, '')
  run.onCleanup(() => {
    flight.remove()
    run.html.removeAttribute(AVATAR_FLIGHT_ATTRIBUTE)
  })
  let animation: Animation | undefined
  let duration = 0
  return {
    launch(timing) {
      duration = timing.duration
      animation = run.animate(flight, frames, timing)
      return animation
    },
    retarget(actual) {
      const correction = correctionFrames(to, actual, to.width / from.width)
      if (!correction || !animation) return
      const played = Number(animation.currentTime ?? 0)
      run.animate(face, correction, {
        duration: Math.max(1, duration - played),
        easing: FADE_EASING,
      })
    },
  }
}

/**
 * Open: the circle grows out of the disc over the receding, dimming page
 * while the avatar clone flies to the header. Only when the circle covers
 * the whole screen (by its own animation clock) does the route swap; her
 * page then fades and rises in above the circle.
 */
function runOpen(run: Run, origin: ExpandOrigin, timeline: ExpandTimeline) {
  const { html } = run
  const { circle, dim } = overlayLayers(run, origin)
  html.setAttribute(LAYER, 'base')
  const motion = { duration: timeline.duration, easing: timeline.easing }
  const target = headerAvatarTarget()
  const flight = avatarFlight(
    run,
    avatarBox('nav'),
    target,
    avatarElement('nav'),
  )
  const grow = run.animate(circle, circleFrames(timeline), motion)
  run.animate(circle, [{ opacity: 0 }, { opacity: 1 }], {
    duration: CIRCLE_IN_MS,
    easing: FADE_EASING,
  })
  const dimIn = run.animate(dim, dimFrames('open'), {
    duration: timeline.duration,
    easing: FADE_EASING,
  })
  const recede = recedeStage(run, origin, 'open', motion)
  const fly = flight?.launch(motion)
  run.atTime(grow, timeline.coverAt, () => {
    for (const animation of recede) animation.cancel()
    html.setAttribute(LAYER, 'top')
    run.swap()
    // The header exists now and the stage is untransformed: its box is exact
    // (the layout is the one the next frame needs anyway).
    const header = avatarElement('header')?.getBoundingClientRect()
    if (header?.width) {
      recordAvatarBox('header', header)
      flight?.retarget(header)
    }
    const fadeIn = run.stage().map((element) =>
      run.animate(element, topFrames('open'), {
        duration: Math.max(timeline.duration - timeline.coverAt, MIN_TOP_IN_MS),
        easing: FADE_EASING,
      }),
    )
    run.onFinished([grow, dimIn, fly, ...fadeIn], () => run.finish(true))
  })
}

/**
 * Close: the circle appears over her page at full size (a quick opacity
 * fade), the route swaps under it, and once the destination has painted
 * the circle shrinks into the disc on the accelerating curve while the
 * page returns from its recede and the clone flies back to the disc.
 */
function runClose(run: Run, origin: ExpandOrigin, timeline: ExpandTimeline) {
  const { html } = run
  const { circle, dim } = overlayLayers(run, origin)
  html.setAttribute(LAYER, 'base')
  const to = avatarBox('nav')
  const flight = to
    ? avatarFlight(
        run,
        avatarBox('header') ?? headerAvatarTarget(),
        to,
        avatarElement('header'),
      )
    : undefined
  const cover = run.animate(circle, [{ opacity: 0 }, { opacity: 1 }], {
    duration: TOP_OUT_MS,
    easing: FADE_EASING,
  })
  run.onFinished([cover], () => {
    run.swap()
    run.afterPaint(() => {
      const motion = { duration: timeline.duration, easing: COLLAPSE_EASING }
      const shrink = run.animate(circle, circleFrames(timeline), motion)
      run.animate(circle, [{ opacity: 1 }, { opacity: 0 }], {
        delay: timeline.duration - CIRCLE_OUT_MS,
        duration: CIRCLE_OUT_MS,
        easing: FADE_EASING,
      })
      const dimOut = run.animate(dim, dimFrames('close'), motion)
      // Measured after the swap: the list pane is back beside the page.
      const back = recedeStage(run, origin, 'close', motion)
      const fly = flight?.launch(motion)
      run.onFinished([shrink, dimOut, ...back, fly], () => run.finish(true))
    })
  })
}
