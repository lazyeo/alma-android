/**
 * Numbers and keyframes for the /alma expand and collapse. Everything here
 * is pure, and every animated property is `transform` or `opacity`.
 */

/** Mirrors `--dur-expand`. */
export const EXPAND_MS = 380
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
 * A slightly underdamped spring over normalised time 0..1. Damping 0.8
 * overshoots by about 1.5% and settles well before the end, so the motion
 * has weight without the long drift of a bezier tail.
 */
export const SPRING = { damping: 0.8, frequency: 8.5 } as const

export function springProgress(t: number, spring = SPRING) {
  if (t <= 0) return 0
  if (t >= 1) return 1
  const { damping: z, frequency: w } = spring
  const wd = w * Math.sqrt(1 - z * z)
  return (
    1 -
    Math.exp(-z * w * t) *
      (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t))
  )
}

const round = (value: number) => String(Number(value.toFixed(4)))

/** The spring as a CSS `linear()` easing; mirrors `--ease-expand`. */
export function springEasing(samples = 32, spring = SPRING) {
  const points: string[] = []
  for (let index = 0; index <= samples; index++)
    points.push(round(springProgress(index / samples, spring)))
  return `linear(${points.join(', ')})`
}

export const EXPAND_EASING = springEasing()

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
    const s = scale.from + (scale.to - scale.from) * springProgress(t)
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
