/**
 * Numbers and keyframes for the /alma expand and collapse. Everything here
 * is pure, and every animated property is `transform` or `opacity`.
 */

/** Mirrors `--dur-expand`. */
export const EXPAND_MS = 460
/** Mirrors `--dur-collapse`. */
export const COLLAPSE_MS = 340
/** Mirrors `--ease-collapse`: accelerates into the disc, no settle. */
export const COLLAPSE_EASING = 'cubic-bezier(0.32, 0, 0.67, 0)'
/** Mirrors `--ease-out`, for fades. */
export const FADE_EASING = 'cubic-bezier(0.2, 0.9, 0.3, 1)'
/** Used where `linear()` is unsupported (WebView < 113). */
export const EXPAND_EASING_FALLBACK = FADE_EASING

/** The page behind recedes to this scale while Alma's screen covers it. */
export const RECEDE_SCALE = 0.94
/** Opacity of the `--overlay-backdrop` scrim over the receding page. */
export const DIM_OPACITY = 0.7
/** Share of the viewport the circle covers before her page fades in. */
export const FADE_COVERAGE = 0.65
/** The arriving page's content rises this far as it fades in. */
export const RISE_PX = 8
/** Shortest fade-in, so a far-away disc still reads as a fade. */
export const MIN_FADE_MS = 140
/** The circle fades in from the disc over this long (it starts disc-sized). */
export const CIRCLE_IN_MS = 60
/** Collapse: the full-size circle fades in over her page this fast. */
export const TOP_OUT_MS = 90
/** Collapse: the disc-sized circle fades over the last stretch. */
export const CIRCLE_OUT_MS = 50
/** Mirrors `--dur-fast`: the crossfade's second half, the new page in. */
export const CROSSFADE_IN_MS = 160

/** Mirrors `--dur-panel` + 3 × `--dur-stagger`: the shell's message rise. */
export const ENTRANCE_MS = 250 + 3 * 40

/**
 * The expand curve: `cubic-bezier(0.3, 0, 0.1, 1)` scaled to peak at
 * 1 + overshoot by `peak` of the run, then a half-cosine settle back to 1.
 * The overshoot is 3%, a noticeable bounce at the end.
 */
export interface ExpandCurve {
  bezier: readonly [number, number, number, number]
  peak: number
  overshoot: number
}

export const EXPAND_CURVE: ExpandCurve = {
  bezier: [0.3, 0, 0.1, 1],
  peak: 0.74,
  overshoot: 0.03,
}

/** A CSS cubic-bezier's progress at time `x`, solved by bisection. */
export function cubicBezierAt(
  x: number,
  [x1, y1, x2, y2]: readonly [number, number, number, number],
  iterations = 40,
) {
  const axis = (t: number, p1: number, p2: number) =>
    3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3
  let lo = 0
  let hi = 1
  for (let index = 0; index < iterations; index++) {
    const mid = (lo + hi) / 2
    if (axis(mid, x1, x2) < x) lo = mid
    else hi = mid
  }
  return axis((lo + hi) / 2, y1, y2)
}

/** The expand curve's progress at normalised time `t` (0..1). */
export function expandProgress(t: number, curve = EXPAND_CURVE) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const { bezier, peak, overshoot } = curve
  if (t <= peak) return cubicBezierAt(t / peak, bezier) * (1 + overshoot)
  return (
    1 + (overshoot * (1 + Math.cos((Math.PI * (t - peak)) / (1 - peak)))) / 2
  )
}

/** The expand curve as a CSS `linear()` easing; mirrors `--ease-expand`. */
export function expandEasing(samples = 48, curve = EXPAND_CURVE) {
  const points: string[] = []
  for (let index = 0; index <= samples; index++)
    points.push(
      index === samples
        ? '1'
        : String(Number(expandProgress(index / samples, curve).toFixed(4))),
    )
  return `linear(${points.join(', ')})`
}

export const EXPAND_EASING = expandEasing()

/**
 * Her face's flight on open settles on the same curve with the overshoot
 * capped: 1% of the travel or 4px, whichever is smaller. 3% of a face
 * crossing the whole phone is a 25px bounce; the circle keeps its own.
 */
export const FACE_OVERSHOOT = { ratio: 0.01, maxPx: 4 } as const

/** The expand curve for a face flight travelling `travelPx` at most. */
export function faceFlightCurve(travelPx: number): ExpandCurve {
  const overshoot =
    travelPx > 0
      ? Math.min(FACE_OVERSHOOT.ratio, FACE_OVERSHOOT.maxPx / travelPx)
      : 0
  return { ...EXPAND_CURVE, overshoot }
}

/** The face flight's easing; `linear()` where supported, else the fade. */
export function faceFlightEasing(travelPx: number, linear = true) {
  return linear
    ? expandEasing(48, faceFlightCurve(travelPx))
    : EXPAND_EASING_FALLBACK
}

/** Sampled points of a `linear()` easing string. */
export function linearPoints(easing: string) {
  const inner = /^linear\((.*)\)$/.exec(easing)?.[1]
  return inner ? inner.split(',').map((point) => Number(point.trim())) : []
}

export function supportsLinearEasing() {
  return (
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('animation-timing-function', 'linear(0, 1)')
  )
}

export interface Point {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

/** Fraction of the viewport inside a circle, integrated in vertical slices. */
export function circleCoverage(
  centre: Point,
  radius: number,
  viewport: Size,
  slices = 160,
) {
  if (radius <= 0 || !viewport.width || !viewport.height) return 0
  const step = viewport.width / slices
  let covered = 0
  for (let index = 0; index < slices; index++) {
    const dx = Math.abs((index + 0.5) * step - centre.x)
    if (dx >= radius) continue
    const half = Math.sqrt(radius * radius - dx * dx)
    const top = Math.max(0, centre.y - half)
    const bottom = Math.min(viewport.height, centre.y + half)
    if (bottom > top) covered += (bottom - top) * step
  }
  return Math.min(1, covered / (viewport.width * viewport.height))
}

/** The circle is full-size (radius R) at scale 1 and disc-sized at `from`. */
export function circleScales(discRadius: number, radius: number) {
  const from = radius > 0 ? Math.min(1, Math.max(0, discRadius / radius)) : 1
  return { from, to: 1 }
}

export type ExpandDirection = 'open' | 'close'

export interface ExpandTimeline {
  direction: ExpandDirection
  /** The circle, recede and scrim run this long. */
  duration: number
  easing: string
  scale: { from: number; to: number }
  /** Open: when her page starts fading in over the circle (ms). */
  fadeAt: number
  fadeDuration: number
  /** Open: when the circle first covers the whole viewport (ms). */
  coverAt: number
}

/**
 * Timing for one run. Open waits for the circle to cover FADE_COVERAGE of
 * the screen; the route swaps at `coverAt`, once the circle hides
 * everything, and her page fades in from there.
 */
export function expandTimeline({
  direction,
  centre,
  radius,
  discRadius,
  viewport,
  linear = true,
}: {
  direction: ExpandDirection
  centre: Point
  radius: number
  discRadius: number
  viewport: Size
  linear?: boolean
}): ExpandTimeline {
  const scale = circleScales(discRadius, radius)
  if (direction === 'close')
    return {
      direction,
      duration: COLLAPSE_MS,
      easing: COLLAPSE_EASING,
      scale: { from: scale.to, to: scale.from },
      fadeAt: 0,
      fadeDuration: TOP_OUT_MS,
      coverAt: 0,
    }
  const steps = 200
  let fadeAt: number | undefined
  let coverAt: number | undefined
  for (let index = 0; index <= steps; index++) {
    const t = index / steps
    const s = scale.from + (scale.to - scale.from) * expandProgress(t)
    const coverage = circleCoverage(centre, s * radius, viewport)
    if (fadeAt === undefined && coverage >= FADE_COVERAGE) fadeAt = t
    if (coverAt === undefined && coverage >= 0.999) coverAt = t
    if (coverAt !== undefined) break
  }
  const fadeStart = Math.min(
    Math.round((fadeAt ?? 1) * EXPAND_MS),
    EXPAND_MS - MIN_FADE_MS,
  )
  return {
    direction,
    duration: EXPAND_MS,
    easing: linear ? EXPAND_EASING : EXPAND_EASING_FALLBACK,
    scale,
    fadeAt: fadeStart,
    fadeDuration: EXPAND_MS - fadeStart,
    coverAt: Math.round((coverAt ?? 1) * EXPAND_MS),
  }
}

/** Scale keyframes for the circle element. */
export function circleFrames(timeline: ExpandTimeline): Keyframe[] {
  return [
    { transform: `scale(${timeline.scale.from})` },
    { transform: `scale(${timeline.scale.to})` },
  ]
}

/** The page behind: recedes on open, returns on close. */
export function recedeFrames(direction: ExpandDirection): Keyframe[] {
  const frames = [
    { transform: 'scale(1)' },
    { transform: `scale(${RECEDE_SCALE})` },
  ]
  return direction === 'open' ? frames : frames.reverse()
}

export function dimFrames(direction: ExpandDirection): Keyframe[] {
  const frames = [{ opacity: 0 }, { opacity: DIM_OPACITY }]
  return direction === 'open' ? frames : frames.reverse()
}

/** Her page fading in (open) or out (close). */
export function topFrames(direction: ExpandDirection): Keyframe[] {
  return direction === 'open'
    ? [
        { opacity: 0, transform: `translateY(${RISE_PX}px)` },
        { opacity: 1, transform: 'translateY(0)' },
      ]
    : [{ opacity: 1 }, { opacity: 0 }]
}
