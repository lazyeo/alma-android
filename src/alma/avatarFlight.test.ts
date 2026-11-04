import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  FLIGHT_EASING,
  FLIGHT_MS,
  clearFlightOrigin,
  flightMode,
  flipKeyframes,
  recordFlightOrigin,
  takeFlightOrigin,
} from './avatarFlight'

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8')
const box = (left: number, top: number, size: number) => ({
  left,
  top,
  width: size,
  height: size,
})

afterEach(clearFlightOrigin)

describe('flightMode', () => {
  it('uses View Transitions when available and FLIP otherwise', () => {
    expect(flightMode({ reduced: false, viewTransitions: true })).toBe(
      'view-transition',
    )
    expect(flightMode({ reduced: false, viewTransitions: false })).toBe('flip')
  })

  it('never flies under reduced motion, whatever the browser supports', () => {
    expect(flightMode({ reduced: true, viewTransitions: true })).toBe('none')
    expect(flightMode({ reduced: true, viewTransitions: false })).toBe('none')
  })
})

describe('flight origin handoff', () => {
  it('hands the leaving box to the other end exactly once', () => {
    recordFlightOrigin('nav', box(160, 700, 56), 1000)
    expect(takeFlightOrigin('nav', 1010)).toBeUndefined()
    expect(takeFlightOrigin('header', 1020)).toEqual(box(160, 700, 56))
    expect(takeFlightOrigin('header', 1030)).toBeUndefined()
  })

  it('ignores a stale origin from an unrelated navigation', () => {
    recordFlightOrigin('header', box(56, 12, 36), 1000)
    expect(takeFlightOrigin('nav', 2000)).toBeUndefined()
  })
})

describe('flipKeyframes', () => {
  it('maps the header box back onto the tab box with transform only', () => {
    const frames = flipKeyframes(box(160, 700, 56), box(50, 12, 36))!
    expect(frames).toEqual([
      { transform: `translate(120px, 698px) scale(${56 / 36})` },
      { transform: 'none' },
    ])
    for (const frame of frames)
      expect(Object.keys(frame)).toEqual(['transform'])
  })

  it('skips no-op and unmeasured flights', () => {
    expect(flipKeyframes(box(10, 10, 40), box(10, 10, 40))).toBeUndefined()
    expect(flipKeyframes(box(10, 10, 40), box(0, 0, 0))).toBeUndefined()
  })
})

describe('flight styles', () => {
  it('keeps the FLIP fallback in step with the CSS tokens', () => {
    expect(css).toContain(`--dur-flight: ${FLIGHT_MS}ms;`)
    expect(css).toContain(`--ease-spring: ${FLIGHT_EASING};`)
    expect(css).toMatch(
      /::view-transition-group\(alma-avatar\) \{[^}]*var\(--dur-flight\)[^}]*var\(--ease-spring\)/,
    )
  })

  it('names the avatar only during the alma motion', () => {
    expect(css).toContain(
      "html[data-nav-motion='alma'] .alma-avatar-flight {\n  view-transition-name: alma-avatar;",
    )
    expect(css.match(/view-transition-name: alma-avatar;/g)).toHaveLength(1)
  })
})
