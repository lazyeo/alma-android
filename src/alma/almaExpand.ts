/**
 * The whole-screen expand into /alma: a circle of her page colour grows out
 * of the avatar disc while the page behind recedes, then her page fades in
 * on top; Back shrinks it into the disc again. The router decides *that*
 * Alma is entered or left; this module decides where the circle starts,
 * which variant runs, and keeps the main thread quiet while it does.
 *
 * Every animated property is `transform` or `opacity`, so the compositor
 * runs the motion on its own. With View Transitions (`reveal`) the old page
 * is a frozen snapshot and the circle and scrim are painted on their own
 * transition groups; without them (`overlay`) the same layers are real
 * elements and the pages swap once the circle covers the screen.
 */
import { useSyncExternalStore } from 'react'
import { haptic } from '../haptics'
import {
  avatarFrames,
  circleFrames,
  CIRCLE_IN_MS,
  CIRCLE_OUT_MS,
  COLLAPSE_EASING,
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

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

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
 * - `reveal`: View Transitions keep the old page as a snapshot; circle,
 *   scrim and both pages animate as transition pseudo-elements.
 * - `overlay`: no View Transitions; the circle and scrim are real elements
 *   over #root and the pages swap under a fully covering circle.
 * - `crossfade`: reduced motion, or no disc to grow from.
 */
export type ExpandMode = 'reveal' | 'overlay' | 'crossfade'

/** Circle origin for a disc box; the radius always reaches every corner. */
export function expandOrigin(disc: Box, viewport: Viewport): ExpandOrigin {
  const x = disc.left + disc.width / 2
  const y = disc.top + disc.height / 2
  const dx = Math.max(x, viewport.width - x)
  const dy = Math.max(y, viewport.height - y)
  return { x, y, radius: Math.ceil(Math.hypot(dx, dy)) }
}

export function expandMode({
  reduced,
  viewTransitions,
  hasOrigin,
}: {
  reduced: boolean
  viewTransitions: boolean
  hasOrigin: boolean
}): ExpandMode {
  if (reduced || !hasOrigin) return 'crossfade'
  return viewTransitions ? 'reveal' : 'overlay'
}

// The disc's last on-screen box. Open records it on tap; close reuses it so
// the circle shrinks back into the same disc the user left from.
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

export interface ViewTransitionLike {
  ready: Promise<void>
  finished: Promise<void>
  skipTransition?: () => void
}

export type NavMotionAttribute = 'alma' | 'fade' | 'none'

export interface AlmaTransitionOptions {
  direction: ExpandDirection
  reduced: boolean
  /** Synchronously renders the destination route. */
  commit(): void
  /** Present only when the browser has View Transitions. */
  startViewTransition?: (update: () => void) => ViewTransitionLike
  /** Sets `data-nav-motion` (the avatar's shared name keys off `alma`). */
  setNavMotion(motion: NavMotionAttribute): void
  viewport?: Viewport
  html?: HTMLElement
}

const MOTION = 'data-alma-motion'
const EXPAND = 'data-alma-expand'
const LAYER = 'data-alma-expand-layer'
const ORIGIN_X = '--alma-expand-x'
const ORIGIN_Y = '--alma-expand-y'
const CIRCLE = 'alma-expand-circle'
const DIM = 'alma-expand-dim'
const BASE = 'alma-expand-base'
const TOP = 'alma-expand-top'
const AVATAR = 'alma-avatar'

const group = (name: string) => `::view-transition-group(${name})`
const oldImage = (name: string) => `::view-transition-old(${name})`
const newImage = (name: string) => `::view-transition-new(${name})`

let active: { cancel(): void } | undefined

/** Ends any running expand at once (a newer navigation took over). */
export function cancelAlmaTransition() {
  active?.cancel()
  active = undefined
}

function avatarBox() {
  const element = document.querySelector<HTMLElement>('.alma-avatar-flight')
  return element?.getBoundingClientRect()
}

function layerElement(className: string, paint: boolean) {
  const element = document.createElement('div')
  element.className = className
  element.setAttribute('aria-hidden', 'true')
  if (paint) element.dataset.paint = 'true'
  return element
}

function circleElement(origin: ExpandOrigin, paint: boolean) {
  const element = layerElement(CIRCLE, paint)
  const size = `${origin.radius * 2}px`
  Object.assign(element.style, {
    left: `${origin.x - origin.radius}px`,
    top: `${origin.y - origin.radius}px`,
    width: size,
    height: size,
  })
  return element
}

/**
 * Runs the transition for one Alma navigation and returns the variant.
 * The caller must not commit the route itself: this calls `commit` at the
 * right moment (inside the View Transition update, or under the covering
 * circle for the overlay variant).
 */
export function startAlmaTransition(
  options: AlmaTransitionOptions,
): ExpandMode {
  cancelAlmaTransition()
  const html = options.html ?? document.documentElement
  const viewport = options.viewport ?? {
    width: window.innerWidth,
    height: window.innerHeight,
  }
  const box = lastExpandDisc()
  const mode = expandMode({
    reduced: options.reduced,
    viewTransitions: Boolean(options.startViewTransition),
    hasOrigin: Boolean(box),
  })
  const { direction } = options
  const metrics: AlmaExpandMetrics = { mode, direction, startedAt: now() }
  publishMetrics(metrics)

  // Her page mounts as a cheap shell; the full thread waits for `finished`.
  setMotionState({
    running: true,
    deferHeavy: direction === 'open' ? true : state.deferHeavy,
  })
  html.setAttribute(MOTION, direction)

  const cleanups: Array<() => void> = []
  let done = false
  const finish = (landed: boolean) => {
    if (done) return
    done = true
    if (active === run) active = undefined
    for (const cleanup of cleanups.splice(0)) cleanup()
    html.removeAttribute(MOTION)
    html.removeAttribute(EXPAND)
    html.removeAttribute(LAYER)
    html.style.removeProperty(ORIGIN_X)
    html.style.removeProperty(ORIGIN_Y)
    options.setNavMotion('none')
    setMotionState({ running: false })
    if (state.deferHeavy) scheduleHeavy(landed ? ENTRANCE_MS : 0)
    if (landed && direction === 'open' && mode !== 'crossfade')
      void haptic('selection')
    metrics.finishedAt = now()
    publishMetrics(metrics)
  }
  const run = { cancel: () => finish(false) }
  active = run

  if (mode === 'crossfade' || !box) {
    if (options.startViewTransition) {
      options.setNavMotion(options.reduced ? 'fade' : 'alma')
      const transition = options.startViewTransition(options.commit)
      cleanups.push(() => transition.skipTransition?.())
      void transition.finished.then(
        () => finish(true),
        () => finish(true),
      )
    } else {
      options.commit()
      finish(true)
    }
    return mode
  }

  const origin = expandOrigin(box, viewport)
  const timeline = expandTimeline({
    direction,
    centre: origin,
    radius: origin.radius,
    discRadius: box.width / 2,
    viewport,
    linear: supportsLinearEasing(),
  })
  html.style.setProperty(ORIGIN_X, `${origin.x}px`)
  html.style.setProperty(ORIGIN_Y, `${origin.y}px`)
  html.setAttribute(EXPAND, mode)

  if (mode === 'reveal')
    runReveal(options, html, origin, timeline, cleanups, finish)
  else runOverlay(options, html, origin, timeline, cleanups, finish)
  return mode
}

function runReveal(
  options: AlmaTransitionOptions,
  html: HTMLElement,
  origin: ExpandOrigin,
  timeline: ExpandTimeline,
  cleanups: Array<() => void>,
  finish: (landed: boolean) => void,
) {
  const open = timeline.direction === 'open'
  // Unpainted: their groups carry the paint, so no oversized snapshot is
  // ever captured or re-rastered.
  const circle = circleElement(origin, false)
  const dim = layerElement(DIM, false)
  document.body.append(dim, circle)
  cleanups.push(() => {
    circle.remove()
    dim.remove()
  })
  options.setNavMotion('alma')
  html.setAttribute(LAYER, open ? 'base' : 'top')
  const from = avatarBox()
  const transition = options.startViewTransition!(() => {
    html.setAttribute(LAYER, open ? 'top' : 'base')
    options.commit()
  })
  cleanups.push(() => transition.skipTransition?.())

  void transition.ready.then(
    () => {
      const animate = (
        pseudoElement: string,
        frames: Keyframe[],
        timing: KeyframeAnimationOptions,
      ) => html.animate(frames, { fill: 'both', ...timing, pseudoElement })
      const main = timeline.duration
      const motion = { duration: main, easing: timeline.easing }
      animate(
        group(CIRCLE),
        circleFrames(timeline, {
          x: origin.x - origin.radius,
          y: origin.y - origin.radius,
        }),
        motion,
      )
      animate(group(DIM), dimFrames(timeline.direction), {
        duration: main,
        easing: open ? FADE_EASING : COLLAPSE_EASING,
      })
      if (open) {
        animate(group(CIRCLE), [{ opacity: 0 }, { opacity: 1 }], {
          duration: CIRCLE_IN_MS,
          easing: FADE_EASING,
        })
        animate(oldImage(BASE), recedeFrames('open'), motion)
        animate(newImage(TOP), topFrames('open'), {
          delay: timeline.fadeAt,
          duration: timeline.fadeDuration,
          easing: FADE_EASING,
        })
      } else {
        animate(oldImage(TOP), topFrames('close'), {
          duration: TOP_OUT_MS,
          easing: FADE_EASING,
        })
        animate(group(CIRCLE), [{ opacity: 1 }, { opacity: 0 }], {
          delay: main - CIRCLE_OUT_MS,
          duration: CIRCLE_OUT_MS,
          easing: FADE_EASING,
        })
        animate(newImage(BASE), recedeFrames('close'), motion)
      }
      const to = avatarBox()
      const flight = from && to ? avatarFrames(from, to) : undefined
      if (flight) animate(group(AVATAR), flight, motion)
    },
    () => finish(false),
  )
  void transition.finished.then(
    () => finish(true),
    () => finish(false),
  )
}

function runOverlay(
  options: AlmaTransitionOptions,
  html: HTMLElement,
  origin: ExpandOrigin,
  timeline: ExpandTimeline,
  cleanups: Array<() => void>,
  finish: (landed: boolean) => void,
) {
  const open = timeline.direction === 'open'
  const root = document.getElementById('root') ?? document.body
  const circle = circleElement(origin, true)
  const dim = layerElement(DIM, true)
  const layers = [root, circle, dim]
  for (const layer of layers) layer.style.willChange = 'transform, opacity'
  dim.style.opacity = '0'
  document.body.append(dim, circle)
  const animations: Animation[] = []
  const timers: Array<ReturnType<typeof setTimeout>> = []
  cleanups.push(() => {
    for (const timer of timers) clearTimeout(timer)
    for (const animation of animations) animation.cancel()
    for (const layer of layers) layer.style.removeProperty('will-change')
    dim.style.removeProperty('opacity')
    circle.remove()
    dim.remove()
  })
  const animate = (
    element: HTMLElement,
    frames: Keyframe[],
    timing: KeyframeAnimationOptions,
  ) => {
    const animation = element.animate(frames, { fill: 'both', ...timing })
    animations.push(animation)
    return animation
  }
  const after = (ms: number, callback: () => void) =>
    timers.push(setTimeout(callback, ms))
  const motion = { duration: timeline.duration, easing: timeline.easing }

  if (open) {
    html.setAttribute(LAYER, 'base')
    animate(circle, circleFrames(timeline), motion)
    animate(circle, [{ opacity: 0 }, { opacity: 1 }], {
      duration: CIRCLE_IN_MS,
      easing: FADE_EASING,
    })
    animate(dim, dimFrames('open'), {
      duration: timeline.duration,
      easing: FADE_EASING,
    })
    const recede = animate(root, recedeFrames('open'), motion)
    // Nothing of the old page shows once the circle covers it: swap there,
    // and let her page fade in above the circle.
    const fade = Math.max(timeline.duration - timeline.coverAt, 160)
    after(timeline.coverAt, () => {
      recede.cancel()
      html.setAttribute(LAYER, 'top')
      options.commit()
      animate(root, topFrames('open'), { duration: fade, easing: FADE_EASING })
    })
    after(Math.max(timeline.duration, timeline.coverAt + fade), () =>
      finish(true),
    )
    return
  }

  // Close: her page fades off the full circle, then the circle shrinks
  // into the disc over the returning page.
  html.setAttribute(LAYER, 'top')
  animate(root, topFrames('close'), {
    duration: TOP_OUT_MS,
    easing: FADE_EASING,
  })
  after(TOP_OUT_MS, () => {
    for (const animation of animations.splice(0)) animation.cancel()
    html.setAttribute(LAYER, 'base')
    options.commit()
    animate(circle, circleFrames(timeline), motion)
    animate(circle, [{ opacity: 1 }, { opacity: 0 }], {
      delay: timeline.duration - CIRCLE_OUT_MS,
      duration: CIRCLE_OUT_MS,
      easing: FADE_EASING,
    })
    animate(dim, dimFrames('close'), motion)
    animate(root, recedeFrames('close'), motion)
  })
  after(TOP_OUT_MS + timeline.duration, () => finish(true))
}
