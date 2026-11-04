import { describe, expect, it } from 'vitest'
import {
  avatarFrames,
  circleCoverage,
  circleFrames,
  circleScales,
  COLLAPSE_EASING,
  COLLAPSE_MS,
  dimFrames,
  EXPAND_EASING,
  EXPAND_EASING_FALLBACK,
  EXPAND_MS,
  expandTimeline,
  FADE_COVERAGE,
  linearPoints,
  MIN_FADE_MS,
  recedeFrames,
  springProgress,
  topFrames,
  TOP_OUT_MS,
} from './expandMotion'

const phone = { width: 400, height: 860 }
// Tab bar disc: 48px, centred near the bottom.
const centre = { x: 200, y: 812 }
const radius = Math.ceil(Math.hypot(200, 812))
const discRadius = 24

const COMPOSITOR_ONLY = new Set(['transform', 'opacity', 'offset', 'easing'])
const properties = (frames: Keyframe[]) =>
  frames.flatMap((frame) => Object.keys(frame))

describe('spring easing', () => {
  it('starts at 0, ends exactly at 1 and settles before the end', () => {
    const points = linearPoints(EXPAND_EASING)
    expect(points.length).toBeGreaterThan(16)
    expect(points[0]).toBe(0)
    expect(points.at(-1)).toBe(1)
    // No visible jump on the last frame.
    expect(Math.abs(points.at(-2)! - 1)).toBeLessThan(0.005)
  })

  it('overshoots the circle scale by no more than 2%', () => {
    const points = linearPoints(EXPAND_EASING)
    const peak = Math.max(...points)
    expect(peak).toBeGreaterThan(1)
    const { from } = circleScales(discRadius, radius)
    expect(from + (1 - from) * peak).toBeLessThanOrEqual(1.02)
  })

  it('rises without dipping until its single peak', () => {
    const points = linearPoints(EXPAND_EASING)
    const peakIndex = points.indexOf(Math.max(...points))
    for (let index = 1; index <= peakIndex; index++)
      expect(points[index]).toBeGreaterThanOrEqual(points[index - 1])
    expect(springProgress(0)).toBe(0)
    expect(springProgress(1)).toBe(1)
  })
})

describe('circle geometry', () => {
  it('scales from the disc radius to the covering radius', () => {
    expect(circleScales(24, 800)).toEqual({ from: 0.03, to: 1 })
    expect(circleScales(24, 0)).toEqual({ from: 1, to: 1 })
  })

  it('measures how much of the viewport the circle covers', () => {
    expect(circleCoverage(centre, 0, phone)).toBe(0)
    expect(circleCoverage(centre, radius, phone)).toBeCloseTo(1, 3)
    // A quarter disc in the top-left corner.
    const quarter = circleCoverage({ x: 0, y: 0 }, 100, phone, 800)
    expect(quarter).toBeCloseTo((Math.PI * 100 ** 2) / 4 / (400 * 860), 3)
  })
})

describe('expandTimeline', () => {
  const open = expandTimeline({
    direction: 'open',
    centre,
    radius,
    discRadius,
    viewport: phone,
  })

  it('fades her page in once the circle covers 65% of the screen', () => {
    expect(open.duration).toBe(EXPAND_MS)
    expect(open.easing).toBe(EXPAND_EASING)
    expect(open.fadeAt).toBeGreaterThan(0)
    expect(open.fadeAt).toBeLessThan(EXPAND_MS - MIN_FADE_MS + 1)
    expect(open.fadeAt + open.fadeDuration).toBe(EXPAND_MS)
    const coverageAt = (ms: number) => {
      const scale =
        open.scale.from +
        (open.scale.to - open.scale.from) * springProgress(ms / EXPAND_MS)
      return circleCoverage(centre, scale * radius, phone)
    }
    expect(coverageAt(open.fadeAt)).toBeGreaterThanOrEqual(FADE_COVERAGE - 0.02)
    expect(coverageAt(open.fadeAt - 4)).toBeLessThan(FADE_COVERAGE)
  })

  it('knows when the circle hides the whole old page', () => {
    expect(open.coverAt).toBeGreaterThanOrEqual(open.fadeAt)
    expect(open.coverAt).toBeLessThanOrEqual(EXPAND_MS)
  })

  it('falls back to a bezier where linear() is unsupported', () => {
    expect(
      expandTimeline({
        direction: 'open',
        centre,
        radius,
        discRadius,
        viewport: phone,
        linear: false,
      }).easing,
    ).toBe(EXPAND_EASING_FALLBACK)
  })

  it('collapses faster with an accelerating curve into the disc', () => {
    const close = expandTimeline({
      direction: 'close',
      centre,
      radius,
      discRadius,
      viewport: phone,
    })
    expect(close.duration).toBe(COLLAPSE_MS)
    expect(close.easing).toBe(COLLAPSE_EASING)
    expect(close.scale).toEqual({ from: 1, to: discRadius / radius })
    expect(close.fadeDuration).toBe(TOP_OUT_MS)
  })
})

describe('keyframes', () => {
  const timeline = expandTimeline({
    direction: 'open',
    centre,
    radius,
    discRadius,
    viewport: phone,
  })

  it('animates only transform and opacity', () => {
    for (const frames of [
      circleFrames(timeline),
      circleFrames(timeline, { x: -10, y: 20 }),
      recedeFrames('open'),
      recedeFrames('close'),
      dimFrames('open'),
      dimFrames('close'),
      topFrames('open'),
      topFrames('close'),
      avatarFrames(
        { left: 0, top: 0, width: 48 },
        { left: 10, top: 10, width: 36 },
      )!,
    ])
      for (const property of properties(frames))
        expect(COMPOSITOR_ONLY.has(property), property).toBe(true)
  })

  it('scales the circle from the disc, keeping a group position', () => {
    expect(circleFrames(timeline)).toEqual([
      { transform: `scale(${discRadius / radius})` },
      { transform: 'scale(1)' },
    ])
    expect(circleFrames(timeline, { x: -5, y: 7 })[1]).toEqual({
      transform: 'translate(-5px, 7px) scale(1)',
    })
  })

  it('recedes to 0.94 on open and returns on close', () => {
    expect(recedeFrames('open').at(-1)).toEqual({ transform: 'scale(0.94)' })
    expect(recedeFrames('close')[0]).toEqual({ transform: 'scale(0.94)' })
    expect(topFrames('open')[0]).toEqual({
      opacity: 0,
      transform: 'translateY(8px)',
    })
  })

  it('flies the avatar with translate and scale only', () => {
    expect(
      avatarFrames(
        { left: 176, top: 790, width: 48 },
        { left: 56, top: 12, width: 36 },
      ),
    ).toEqual([
      { transform: `translate(176px, 790px) scale(${48 / 36})` },
      { transform: 'translate(56px, 12px)' },
    ])
    expect(
      avatarFrames(
        { left: 0, top: 0, width: 0 },
        { left: 0, top: 0, width: 1 },
      ),
    ).toBeUndefined()
  })
})
