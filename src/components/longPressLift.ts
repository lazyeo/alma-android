import { useLayoutEffect, useRef, type RefObject } from 'react'
import {
  DUR_FAST_MS,
  FADE_EXIT_MS,
  reducedMotionPreferred,
} from '../motionTokens'
import { t } from '../i18n/runtime'
import {
  previewCardFrom,
  previewCardRect,
  readPreviewTail,
  type PreviewCard,
  type PreviewTail,
} from './longPressPreview'

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
 *
 * Messages arm a preview instead (`preview: true`): the copy is drawn
 * reduced inside a card between the status bar and the sheet (see
 * longPressPreview.ts), since a long message lifted at full size runs off
 * the screen and under its actions. The message itself stays in place
 * under the dim; the card grows out of it and back. An assistant reply
 * that starts with thinking and tool rows is shown from its final summary
 * instead: the copy keeps only the parts named by `data-preview-parts`
 * (each part's wrapper carries `data-message-part`), drops anything marked
 * `data-preview-omit`, and is laid out off screen once to measure it.
 */

/** A long press arms the lift; the overlay it opens must take it this soon. */
const ARM_TTL_MS = 800
/** Canvases beyond these limits are replaced by a blank box, not copied. */
const MAX_CANVASES = 8
const MAX_CANVAS_PIXELS = 4_000_000
/** The skipped-steps hint row above a summary copy, with its gap. */
export const PREVIEW_HINT_PX = 24
const SVG_NS = 'http://www.w3.org/2000/svg'

export interface LongPressLiftArm {
  source: HTMLElement
  /** Show the copy as a reduced preview card (messages). */
  preview: boolean
}

let armed: (LongPressLiftArm & { at: number }) | undefined

/** Called by useLongPress when a pointer long press fires on `source`. */
export function armLongPressLift(
  source: HTMLElement,
  { preview = false }: { preview?: boolean } = {},
) {
  armed = { source, preview, at: performance.now() }
}

export function disarmLongPressLift() {
  armed = undefined
}

/** The just-fired long press, at most once. */
export function takeLongPressLiftArm(): LongPressLiftArm | undefined {
  const pending = armed
  armed = undefined
  if (!pending || !pending.source.isConnected) return undefined
  if (performance.now() - pending.at > ARM_TTL_MS) return undefined
  return { source: pending.source, preview: pending.preview }
}

/** The element a just-fired long press was on, at most once. */
export function takeLongPressLiftSource() {
  return takeLongPressLiftArm()?.source
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
  /** The element that moves; it carries the source's (or the card's) rect. */
  lift: HTMLDivElement
  rect: DOMRect
}

export interface PreviewPlacement {
  card: PreviewCard
  from: { transform: string; opacity: number }
  /**
   * A summary copy, already built and measured (its height is `height`);
   * absent when the card shows the whole message.
   */
  summary?: { content: HTMLDivElement; height: number; skipped: number }
}

/**
 * Appends a copy of `source` to `parent`, with the source's ancestor chain
 * reproduced as `display: contents` wrappers, so selectors scoped to a
 * screen or list still style the copy the way they style the row.
 */
function appendCopy(
  source: HTMLElement,
  parent: HTMLElement,
  tail?: PreviewTail,
) {
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
  if (tail) pruneToTail(clone, tail)
  parent.append(clone)
  return clone
}

/** Keeps only the tail's parts in a message copy (see readPreviewTail). */
function pruneToTail(clone: HTMLElement, tail: PreviewTail) {
  const keep = new Set(tail.parts.map(String))
  clone
    .querySelectorAll<HTMLElement>('[data-message-part], [data-preview-omit]')
    .forEach((node) => {
      const part = node.dataset.messagePart
      if (part === undefined || !keep.has(part)) node.remove()
    })
}

/** The tail to show for `source`, when its part wrappers are rendered. */
function sourceTail(source: HTMLElement) {
  const tail = readPreviewTail(source)
  if (!tail) return undefined
  const rendered = tail.parts.some((part) =>
    source.querySelector(`[data-message-part="${part}"]`),
  )
  return rendered ? tail : undefined
}

/**
 * Builds a summary copy of `source` (its tail parts only) at the source's
 * width and measures it off screen: with parts removed it no longer lays
 * out like the original, so its height cannot be read from the original.
 */
function buildSummaryCopy(
  source: HTMLElement,
  width: number,
  tail: PreviewTail,
) {
  const content = document.createElement('div')
  content.className = 'long-press-preview-content'
  content.style.width = `${width}px`
  const clone = appendCopy(source, content, tail)
  const probe = document.createElement('div')
  probe.className = 'long-press-preview-probe'
  probe.setAttribute('aria-hidden', 'true')
  probe.append(content)
  document.body.append(probe)
  const height = clone.getBoundingClientRect().height
  probe.remove()
  content.remove()
  return { content, height }
}

/** "N steps" with a chevrons-up icon: earlier work sits above this copy. */
function buildHint(card: PreviewCard, skipped: number) {
  const hint = document.createElement('div')
  hint.className = 'long-press-preview-hint'
  hint.style.left = `${card.leadLeft}px`
  hint.style.top = `${card.leadTop}px`
  hint.style.width = `${card.width - card.leadLeft * 2}px`
  const icon = document.createElementNS(SVG_NS, 'svg')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('aria-hidden', 'true')
  for (const points of ['17 11 12 6 7 11', '17 18 12 13 7 18']) {
    const line = document.createElementNS(SVG_NS, 'polyline')
    line.setAttribute('points', points)
    icon.append(line)
  }
  const label = document.createElement('span')
  label.textContent = t('message.previewSkippedSteps', { count: skipped })
  hint.append(icon, label)
  return hint
}

/**
 * Builds the lifted copy of `source`; does not insert or animate it. With
 * `preview`, the copy is laid out reduced inside a card at `preview.card`.
 */
export function buildLongPressLift(
  source: HTMLElement,
  { dim = false, preview }: { dim?: boolean; preview?: PreviewPlacement } = {},
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
  if (preview) {
    buildPreview(source, rect, lift, preview)
    layer.append(lift)
    return { layer, lift, rect }
  }
  lift.style.left = `${rect.left}px`
  lift.style.top = `${rect.top}px`
  lift.style.width = `${rect.width}px`
  lift.style.height = `${rect.height}px`
  const surface = document.createElement('div')
  surface.className = 'long-press-lift-surface'
  if (radius && radius !== '0px') surface.style.borderRadius = radius
  lift.append(surface)
  appendCopy(source, lift)
  layer.append(lift)
  return { layer, lift, rect }
}

/**
 * The card: a pre-drawn surface (border and shadow, outside the clip), a
 * clip holding the copy at its own size scaled by `card.scale`, and, when
 * clipped, a pre-drawn bottom fade. Only the card's transform and opacity
 * and the surface's and fade's opacity change per frame.
 */
function buildPreview(
  source: HTMLElement,
  rect: DOMRect,
  lift: HTMLDivElement,
  { card, from, summary }: PreviewPlacement,
) {
  lift.classList.add('preview')
  lift.style.left = `${card.left}px`
  lift.style.top = `${card.top}px`
  lift.style.width = `${card.width}px`
  lift.style.height = `${card.height}px`
  lift.style.setProperty('--preview-from', from.transform)
  lift.style.setProperty('--preview-from-opacity', String(from.opacity))
  const surface = document.createElement('div')
  surface.className = 'long-press-lift-surface'
  const clip = document.createElement('div')
  clip.className = 'long-press-preview'
  if (card.clipped) clip.dataset.clipped = 'true'
  const content = summary?.content ?? document.createElement('div')
  content.className = 'long-press-preview-content'
  content.style.left = `${card.contentLeft}px`
  content.style.top = `${card.contentTop}px`
  content.style.width = `${rect.width}px`
  content.style.height = `${summary?.height ?? rect.height}px`
  content.style.transform = `scale(${card.scale})`
  if (!summary) appendCopy(source, content)
  clip.append(content)
  if (summary && summary.skipped > 0)
    clip.append(buildHint(card, summary.skipped))
  if (card.clipped) {
    const fade = document.createElement('div')
    fade.className = 'long-press-preview-fade'
    clip.append(fade)
  }
  lift.append(surface, clip)
}

/** Bottom of the status bar, as the app's `--safe-top` resolves. */
function safeTopPx() {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;top:var(--safe-top,0px);height:0;visibility:hidden'
  document.body.append(probe)
  const top = probe.getBoundingClientRect().top
  probe.remove()
  return Number.isFinite(top) ? top : 0
}

/**
 * Where the preview card for `source` goes: in the source's content column
 * (`[data-long-press-column]`, else the source itself), above `avoid` (the
 * actions sheet; its layout top, not its entry transform).
 */
export function placeLongPressPreview(
  source: HTMLElement,
  avoid?: HTMLElement | null,
): PreviewPlacement | undefined {
  const rect = source.getBoundingClientRect()
  const column =
    source.closest<HTMLElement>('[data-long-press-column]') ?? source
  const columnRect = column.getBoundingClientRect()
  const viewport = { width: window.innerWidth, height: window.innerHeight }
  const parent = avoid?.offsetParent
  const sheetTop =
    avoid && parent
      ? parent.getBoundingClientRect().top + avoid.offsetTop
      : viewport.height
  const safeTop = safeTopPx()
  // An unboxed message's own top padding would double the card's.
  const style = getComputedStyle(source)
  const unboxed =
    style.backgroundColor === 'rgba(0, 0, 0, 0)' &&
    (Number.parseFloat(style.borderTopWidth) || 0) === 0
  const tail = sourceTail(source)
  const copy = tail ? buildSummaryCopy(source, rect.width, tail) : undefined
  const skipped = tail?.skipped ?? 0
  const card = previewCardRect({
    source: copy
      ? {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: copy.height,
        }
      : rect,
    column: { left: columnRect.left, right: columnRect.right },
    viewport,
    safeTop,
    sheetTop,
    trimTop: unboxed ? Number.parseFloat(style.paddingTop) || 0 : 0,
    lead: skipped > 0 ? PREVIEW_HINT_PX : 0,
    pop: skipped > 0,
  })
  if (!card) return undefined
  const from = reducedMotionPreferred()
    ? { transform: 'none', opacity: 0 }
    : previewCardFrom(card, rect, safeTop)
  return {
    card,
    from,
    summary: copy && tail ? { ...copy, skipped } : undefined,
  }
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
  /** A preview card keeps above this element (the actions sheet). */
  avoid?: RefObject<HTMLElement | null>
}

export function mountLongPressLift(
  source: HTMLElement,
  host: HTMLElement,
  {
    dim = false,
    hostFades = false,
    preview,
  }: Omit<LongPressLiftOptions, 'avoid'> & {
    preview?: PreviewPlacement
  } = {},
): LongPressLiftHandle {
  const start = performance.now()
  const { layer, lift, rect } = buildLongPressLift(source, { dim, preview })
  host.insertBefore(layer, host.firstChild)
  const previous = source.style.visibility
  let hideTimer: ReturnType<typeof setTimeout> | undefined
  let shown = true
  const hide = () => {
    hideTimer = undefined
    // A preview card moves away from the message; the message stays put.
    if (preview) return
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
      const arm = takeLongPressLiftArm()
      if (!arm) return
      const { avoid, ...options } = optionsRef.current
      let preview: PreviewPlacement | undefined
      if (arm.preview) {
        preview = placeLongPressPreview(arm.source, avoid?.current)
        // No room for a card (a very tall sheet): show no copy at all.
        if (!preview) return
      }
      lift = mountLongPressLift(arm.source, host.current, {
        ...options,
        preview,
      })
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
