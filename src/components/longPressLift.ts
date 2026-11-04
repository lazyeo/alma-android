import { useLayoutEffect, useRef, type RefObject } from 'react'
import {
  DUR_FAST_MS,
  FADE_EXIT_MS,
  reducedMotionPreferred,
} from '../motionTokens'

/**
 * Long-press lift: when a long press opens actions, a copy of the pressed
 * element is raised above the overlay's backdrop (below the menu or sheet),
 * so the object and its actions are seen together.
 *
 * Rows live inside scrolled and transformed containers, so the original
 * cannot be raised over a body-level overlay by z-index. A copy is drawn
 * instead: a DOM clone placed at the same rect, inert and aria-hidden, with
 * the original's ancestor classes reproduced as `display: contents`
 * wrappers so scoped selectors still match. Canvases are copied with
 * drawImage; live media becomes an empty box of the same size.
 */

/** A long press arms the lift; the overlay it opens must take it this soon. */
const ARM_TTL_MS = 800
/** Canvases beyond these limits are replaced by a blank box, not copied. */
const MAX_CANVASES = 8
const MAX_CANVAS_PIXELS = 4_000_000

let armed: { source: HTMLElement; at: number } | undefined

/** Called by useLongPress when a pointer long press fires on `source`. */
export function armLongPressLift(source: HTMLElement) {
  armed = { source, at: performance.now() }
}

export function disarmLongPressLift() {
  armed = undefined
}

/** The element a just-fired long press was on, at most once. */
export function takeLongPressLiftSource() {
  const pending = armed
  armed = undefined
  if (!pending || !pending.source.isConnected) return undefined
  if (performance.now() - pending.at > ARM_TTL_MS) return undefined
  return pending.source
}

function blankBox(of: Element) {
  const box = document.createElement('div')
  box.className = 'long-press-lift-blank'
  const rect = of.getBoundingClientRect()
  box.style.width = `${rect.width}px`
  box.style.height = `${rect.height}px`
  return box
}

function copyCanvases(source: HTMLElement, clone: HTMLElement) {
  const from = source.querySelectorAll('canvas')
  const to = clone.querySelectorAll('canvas')
  let pixels = 0
  from.forEach((canvas, index) => {
    const copy = to[index]
    if (!copy) return
    pixels += canvas.width * canvas.height
    if (index >= MAX_CANVASES || pixels > MAX_CANVAS_PIXELS) {
      copy.replaceWith(blankBox(canvas))
      return
    }
    try {
      copy.getContext('2d')?.drawImage(canvas, 0, 0)
    } catch {
      copy.replaceWith(blankBox(canvas))
    }
  })
}

function replaceLiveMedia(source: HTMLElement, clone: HTMLElement) {
  const from = source.querySelectorAll('video, iframe, audio')
  clone
    .querySelectorAll('video, iframe, audio')
    .forEach((node, index) =>
      node.replaceWith(from[index] ? blankBox(from[index]) : blankBox(node)),
    )
}

export interface BuiltLift {
  /** The whole layer: optional scrim plus the lifted copy. */
  layer: HTMLDivElement
  /** The element that scales; it carries the source's rect. */
  lift: HTMLDivElement
  rect: DOMRect
}

/** Builds the lifted copy of `source`; does not insert or animate it. */
export function buildLongPressLift(
  source: HTMLElement,
  { dim = false }: { dim?: boolean } = {},
): BuiltLift {
  const rect = source.getBoundingClientRect()
  const radius = getComputedStyle(source).borderRadius
  const layer = document.createElement('div')
  layer.className = 'long-press-lift-layer'
  layer.setAttribute('aria-hidden', 'true')
  layer.setAttribute('inert', '')
  layer.dataset.state = 'resting'
  if (reducedMotionPreferred()) layer.dataset.reduced = 'true'
  if (dim) {
    const scrim = document.createElement('div')
    scrim.className = 'long-press-lift-scrim'
    layer.append(scrim)
  }
  const lift = document.createElement('div')
  lift.className = 'long-press-lift'
  lift.style.left = `${rect.left}px`
  lift.style.top = `${rect.top}px`
  lift.style.width = `${rect.width}px`
  lift.style.height = `${rect.height}px`
  const surface = document.createElement('div')
  surface.className = 'long-press-lift-surface'
  if (radius && radius !== '0px') surface.style.borderRadius = radius
  lift.append(surface)

  // Reproduce the ancestor chain without its boxes, so selectors scoped to
  // a screen or list still style the copy the way they style the row.
  let parent: HTMLElement = lift
  const chain: HTMLElement[] = []
  for (
    let node = source.parentElement;
    node && node !== document.body && node !== document.documentElement;
    node = node.parentElement
  )
    chain.unshift(node)
  for (const ancestor of chain) {
    const wrapper = document.createElement(ancestor.tagName)
    if (ancestor.className && typeof ancestor.className === 'string')
      wrapper.className = ancestor.className
    for (const { name, value } of ancestor.attributes)
      if (name.startsWith('data-') || name === 'dir' || name === 'lang')
        wrapper.setAttribute(name, value)
    wrapper.style.display = 'contents'
    parent.append(wrapper)
    parent = wrapper
  }

  const clone = source.cloneNode(true) as HTMLElement
  // The copy must never answer a lookup meant for the row.
  for (const name of ['id', 'data-testid']) {
    clone.removeAttribute(name)
    clone
      .querySelectorAll(`[${name}]`)
      .forEach((node) => node.removeAttribute(name))
  }
  clone.style.removeProperty('visibility')
  clone.classList.add('long-press-lift-clone')
  copyCanvases(source, clone)
  replaceLiveMedia(source, clone)
  parent.append(clone)
  layer.append(lift)
  return { layer, lift, rect }
}

export interface LongPressLiftHandle {
  rect: DOMRect
  /** Milliseconds spent building the copy. */
  buildMs: number
  /** Menu closed normally: settle back, keep the original hidden until removal. */
  settle(): void
  /** The row is going away (delete, move): fade the copy, show the original. */
  fade(): void
  /** Remove the copy and show the original, in the same task. */
  remove(): void
  /**
   * The overlay unmounted while still open (its owner dropped it): keep the
   * copy on a body-level layer just under overlays, settle it there, then
   * remove it and show the original.
   */
  release(): void
  readonly state: 'lifted' | 'settling' | 'fading' | 'removed'
}

export interface LongPressLiftOptions {
  /** Dim the rest of the screen (the overlay itself has no scrim). */
  dim?: boolean
  /**
   * The host fades in and out as a whole (a sheet backdrop): hide the
   * original only once the copy is fully in, and show it again as soon as
   * closing starts, so the row never blinks out under the fading layer.
   */
  hostFades?: boolean
}

export function mountLongPressLift(
  source: HTMLElement,
  host: HTMLElement,
  { dim = false, hostFades = false }: LongPressLiftOptions = {},
): LongPressLiftHandle {
  const start = performance.now()
  const { layer, lift, rect } = buildLongPressLift(source, { dim })
  host.insertBefore(layer, host.firstChild)
  const previous = source.style.visibility
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let shown = true
  const hide = () => {
    hideTimer = undefined
    source.style.visibility = 'hidden'
    shown = false
  }
  const show = () => {
    if (hideTimer !== undefined) clearTimeout(hideTimer)
    hideTimer = undefined
    if (!shown) source.style.visibility = previous
    shown = true
  }
  // Commit the resting frame so the lift transitions from the row's place;
  // the build time includes this style and layout pass for the copy.
  void lift.offsetWidth
  const buildMs = performance.now() - start
  layer.dataset.state = 'lifted'
  if (hostFades) hideTimer = setTimeout(hide, DUR_FAST_MS)
  else hide()
  let removed = false
  let releaseTimer: ReturnType<typeof setTimeout> | undefined
  const handle: LongPressLiftHandle = {
    rect,
    buildMs,
    get state() {
      return removed
        ? 'removed'
        : (layer.dataset.state as 'lifted' | 'settling' | 'fading')
    },
    settle() {
      if (removed || layer.dataset.state === 'fading') return
      if (hostFades) show()
      layer.dataset.state = 'settling'
    },
    fade() {
      if (removed) return
      show()
      layer.dataset.state = 'fading'
    },
    remove() {
      if (removed) return
      removed = true
      if (releaseTimer !== undefined) clearTimeout(releaseTimer)
      show()
      layer.remove()
    },
    release() {
      if (removed) return
      // The row went with the overlay (the screen unmounted): nothing to
      // settle onto.
      if (!source.isConnected) return handle.remove()
      layer.classList.add('released')
      document.body.append(layer)
      if (layer.dataset.state === 'lifted') layer.dataset.state = 'settling'
      releaseTimer = setTimeout(handle.remove, FADE_EXIT_MS)
    },
  }
  return handle
}

/**
 * Takes the armed long-press source when the overlay renders and keeps the
 * copy in `host` for the overlay's life: settles on close, removed with it.
 */
export function useLongPressLift(
  host: RefObject<HTMLElement | null>,
  rendered: boolean,
  closing: boolean,
  options: LongPressLiftOptions = {},
) {
  const handle = useRef<LongPressLiftHandle>()
  // Set between a cleanup and its microtask: a remount in the same task
  // (StrictMode, a re-keyed host) adopts the copy instead of dropping it.
  const leaving = useRef<LongPressLiftHandle>()
  const optionsRef = useRef(options)
  optionsRef.current = options
  useLayoutEffect(() => {
    if (!rendered || !host.current) return
    let lift = leaving.current
    leaving.current = undefined
    if (!lift || lift.state === 'removed') {
      const source = takeLongPressLiftSource()
      if (!source) return
      lift = mountLongPressLift(source, host.current, optionsRef.current)
    }
    handle.current = lift
    return () => {
      leaving.current = lift
      queueMicrotask(() => {
        if (leaving.current !== lift || !lift) return
        leaving.current = undefined
        if (handle.current === lift) handle.current = undefined
        if (lift.state === 'lifted') lift.release()
        else lift.remove()
      })
    }
  }, [host, rendered])
  useLayoutEffect(() => {
    if (closing) handle.current?.settle()
  }, [closing])
  return handle
}
