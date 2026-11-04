import { describe, expect, it } from 'vitest'
import {
  faceActivity,
  faceMoodFromVitals,
  nextBlinkDelay,
  unitScale,
} from './faceState'

describe('unitScale', () => {
  it('folds 0..1, 0..10 and 0..100 readings into one range', () => {
    expect(unitScale(0.3)).toBe(0.3)
    expect(unitScale(7)).toBeCloseTo(0.7)
    expect(unitScale(80)).toBeCloseTo(0.8)
    expect(unitScale(-6)).toBeCloseTo(-0.6)
    expect(unitScale(undefined)).toBeUndefined()
    expect(unitScale(Number.NaN)).toBeUndefined()
  })
})

describe('faceMoodFromVitals', () => {
  it('is neutral without vitals or signal', () => {
    expect(faceMoodFromVitals(undefined)).toBe('neutral')
    expect(faceMoodFromVitals({})).toBe('neutral')
    expect(faceMoodFromVitals({ mood: 'bored', energy: 0.5 })).toBe('neutral')
  })

  it('maps positive moods and high valence to happy', () => {
    for (const mood of ['happy', 'Excited', 'amused', 'content'])
      expect(faceMoodFromVitals({ mood }), mood).toBe('happy')
    expect(faceMoodFromVitals({ valence: 7 })).toBe('happy')
  })

  it('lets fatigue and low energy win over emotion', () => {
    expect(faceMoodFromVitals({ mood: 'happy', fatigue: 0.8 })).toBe('tired')
    expect(faceMoodFromVitals({ energy: 2 })).toBe('tired')
    expect(faceMoodFromVitals({ level: 'exhausted' })).toBe('tired')
  })

  it('turns a weary night into sleepy, but not an energetic one', () => {
    expect(faceMoodFromVitals({ isNight: true, energy: 0.3 })).toBe(
      'sleepy-night',
    )
    expect(faceMoodFromVitals({ isNight: true, fatigue: 6 })).toBe(
      'sleepy-night',
    )
    expect(faceMoodFromVitals({ isNight: true, energy: 0.9 })).toBe('focused')
    expect(faceMoodFromVitals({ isNight: true })).toBe('neutral')
  })

  it('reads high energy without a positive mood as focused', () => {
    expect(faceMoodFromVitals({ energy: 8, mood: 'neutral' })).toBe('focused')
  })
})

describe('faceActivity', () => {
  it('ranks live work above waiting above idle', () => {
    expect(
      faceActivity({ generating: true, running: 0, pendingApprovals: 2 }),
    ).toBe('thinking')
    expect(
      faceActivity({ generating: false, running: 1, pendingApprovals: 2 }),
    ).toBe('thinking')
    expect(
      faceActivity({ generating: false, running: 0, pendingApprovals: 1 }),
    ).toBe('waiting')
    expect(
      faceActivity({ generating: false, running: 0, pendingApprovals: 0 }),
    ).toBe('idle')
  })
})

describe('nextBlinkDelay', () => {
  it('stays within 4–7 seconds', () => {
    expect(nextBlinkDelay(() => 0)).toBe(4000)
    expect(nextBlinkDelay(() => 0.999)).toBeLessThan(7000)
    expect(nextBlinkDelay(() => 0.5)).toBe(5500)
  })
})
