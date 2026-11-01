import { describe, expect, it } from 'vitest'
import {
  LATENCY_STALE_AFTER_MS,
  LatencyTracker,
  isLatencyStale,
  median,
} from './latency'

describe('median', () => {
  it('returns null without samples and the middle of sorted samples', () => {
    expect(median([])).toBeNull()
    expect(median([30, 10, 20])).toBe(20)
    expect(median([40, 10, 30, 20])).toBe(25)
  })
})

describe('LatencyTracker', () => {
  it('keeps the last eight samples independently per transport', () => {
    const tracker = new LatencyTracker()

    for (let sample = 1; sample <= 9; sample += 1)
      tracker.record('relay', sample * 10, sample)
    tracker.record('direct', 7, 20)

    expect(tracker.current('relay')).toEqual({
      transport: 'relay',
      ms: 55,
      sampledAt: 9,
    })
    expect(tracker.current('direct')).toEqual({
      transport: 'direct',
      ms: 7,
      sampledAt: 20,
    })
  })

  it('reports an unsampled transport with a null value', () => {
    expect(new LatencyTracker().current('direct')).toEqual({
      transport: 'direct',
      ms: null,
      sampledAt: 0,
    })
  })
})

describe('isLatencyStale', () => {
  it('becomes stale only after ninety seconds', () => {
    expect(
      isLatencyStale(
        { transport: 'relay', ms: 42, sampledAt: 1_000 },
        1_000 + LATENCY_STALE_AFTER_MS,
      ),
    ).toBe(false)
    expect(
      isLatencyStale(
        { transport: 'relay', ms: 42, sampledAt: 1_000 },
        1_001 + LATENCY_STALE_AFTER_MS,
      ),
    ).toBe(true)
    expect(
      isLatencyStale(
        { transport: 'relay', ms: null, sampledAt: 0 },
        999_999,
      ),
    ).toBe(false)
  })
})
