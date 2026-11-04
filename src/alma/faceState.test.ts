import { describe, expect, it } from 'vitest'
import {
  VITALS_MAX,
  faceActivity,
  faceMoodFromVitals,
  nextBlinkDelay,
  unitScale,
} from './faceState'

describe('unitScale', () => {
  it('reads each vital on its own desktop scale', () => {
    expect(unitScale(7, VITALS_MAX.energy)).toBeCloseTo(0.7)
    expect(unitScale(7, VITALS_MAX.valence)).toBeCloseTo(0.7)
    expect(unitScale(80, VITALS_MAX.fatigue)).toBeCloseTo(0.8)
    // A fatigue of 7 is 7/100, not 7/10.
    expect(unitScale(7, VITALS_MAX.fatigue)).toBeCloseTo(0.07)
  })

  it('clamps out-of-range readings and drops junk', () => {
    expect(unitScale(-3, VITALS_MAX.energy)).toBe(0)
    expect(unitScale(14, VITALS_MAX.energy)).toBe(1)
    expect(unitScale(undefined, VITALS_MAX.energy)).toBeUndefined()
    expect(unitScale(Number.NaN, VITALS_MAX.energy)).toBeUndefined()
  })
})

describe('faceMoodFromVitals', () => {
  it('is neutral without vitals or signal', () => {
    expect(faceMoodFromVitals(undefined)).toBe('neutral')
    expect(faceMoodFromVitals({})).toBe('neutral')
    expect(
      faceMoodFromVitals({ mood: 'bored', energy: 5, valence: 5, fatigue: 30 }),
    ).toBe('neutral')
    expect(faceMoodFromVitals({ level: 'awake' })).toBe('neutral')
  })

  it('maps positive moods and high valence to happy', () => {
    for (const mood of ['happy', 'Cheerful', 'Excited', 'amused', 'content'])
      expect(faceMoodFromVitals({ mood }), mood).toBe('happy')
    expect(faceMoodFromVitals({ valence: 7 })).toBe('happy')
    expect(faceMoodFromVitals({ valence: 5 })).toBe('neutral')
  })

  it('lets fatigue and low energy win over emotion', () => {
    expect(faceMoodFromVitals({ mood: 'cheerful', fatigue: 80 })).toBe('tired')
    expect(faceMoodFromVitals({ mood: 'cheerful', fatigue: 8 })).toBe('happy')
    expect(faceMoodFromVitals({ energy: 2 })).toBe('tired')
    expect(faceMoodFromVitals({ level: 'tired' })).toBe('tired')
    expect(faceMoodFromVitals({ level: 'exhausted' })).toBe('tired')
  })

  it('shows an asleep Alma sleeping, day or night', () => {
    expect(faceMoodFromVitals({ level: 'asleep' })).toBe('sleepy-night')
    expect(
      faceMoodFromVitals({ level: 'asleep', isNight: false, energy: 9 }),
    ).toBe('sleepy-night')
  })

  it('turns a weary night into sleepy, but not an energetic one', () => {
    expect(faceMoodFromVitals({ isNight: true, energy: 3 })).toBe(
      'sleepy-night',
    )
    expect(faceMoodFromVitals({ isNight: true, fatigue: 60 })).toBe(
      'sleepy-night',
    )
    expect(faceMoodFromVitals({ isNight: true, energy: 9 })).toBe('focused')
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
