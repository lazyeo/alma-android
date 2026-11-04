import { describe, expect, it } from 'vitest'
import {
  VITALS_MAX,
  faceActivity,
  faceMoodFromVitals,
  fallbackMood,
  moodFromWord,
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
    for (const mood of ['happy', 'Cheerful', 'Excited', 'amused', '开心'])
      expect(faceMoodFromVitals({ mood }), mood).toBe('happy')
    expect(faceMoodFromVitals({ valence: 7 })).toBe('happy')
    expect(faceMoodFromVitals({ valence: 5 })).toBe('neutral')
  })

  it('reads the desktop mood word for every rig expression', () => {
    const cases: [string, string][] = [
      ['shy', 'shy'],
      ['Annoyed', 'angry'],
      ['busy', 'busy'],
      ['content', 'relaxed'],
      ['awkward', 'embarrassed'],
      ['anxious', 'nervous'],
      ['frightened', 'scared'],
      ['drowsy', 'sleepy'],
      ['unhappy', 'sad'],
      ['curious', 'thinking'],
      ['bored', 'neutral'],
    ]
    for (const [mood, face] of cases)
      expect(faceMoodFromVitals({ mood }), mood).toBe(face)
    expect(moodFromWord('  ')).toBeUndefined()
  })

  it('places valence and energy when no word matches', () => {
    expect(faceMoodFromVitals({ valence: 8, energy: 3 })).toBe('relaxed')
    expect(faceMoodFromVitals({ valence: 2 })).toBe('sad')
    expect(faceMoodFromVitals({ valence: 2, energy: 8 })).toBe('nervous')
  })

  it('lets fatigue and low energy win over emotion', () => {
    expect(faceMoodFromVitals({ mood: 'cheerful', fatigue: 80 })).toBe('tired')
    expect(faceMoodFromVitals({ mood: 'cheerful', fatigue: 8 })).toBe('happy')
    expect(faceMoodFromVitals({ energy: 2 })).toBe('tired')
    expect(faceMoodFromVitals({ level: 'tired' })).toBe('tired')
    expect(faceMoodFromVitals({ level: 'exhausted' })).toBe('tired')
  })

  it('shows an asleep Alma sleeping, day or night', () => {
    expect(faceMoodFromVitals({ level: 'asleep' })).toBe('sleepy')
    expect(
      faceMoodFromVitals({ level: 'asleep', isNight: false, energy: 9 }),
    ).toBe('sleepy')
  })

  it('turns a weary night into sleepy, but not an energetic one', () => {
    expect(faceMoodFromVitals({ isNight: true, energy: 3 })).toBe('sleepy')
    expect(faceMoodFromVitals({ isNight: true, fatigue: 60 })).toBe('sleepy')
    expect(faceMoodFromVitals({ isNight: true, energy: 9 })).toBe('busy')
    expect(faceMoodFromVitals({ isNight: true })).toBe('neutral')
  })

  it('reads high energy without a mood word as busy', () => {
    expect(faceMoodFromVitals({ energy: 8, mood: 'neutral' })).toBe('busy')
  })
})

describe('faceActivity', () => {
  it('ranks her reply above other work above waiting above idle', () => {
    expect(
      faceActivity({ generating: true, running: 3, pendingApprovals: 2 }),
    ).toBe('talking')
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

describe('fallbackMood', () => {
  it('folds rig expressions into what the vector face can draw', () => {
    expect(fallbackMood('relaxed')).toBe('happy')
    expect(fallbackMood('sad')).toBe('tired')
    expect(fallbackMood('sleepy')).toBe('sleepy-night')
    expect(fallbackMood('thinking')).toBe('focused')
    expect(fallbackMood('angry')).toBe('neutral')
  })
})

describe('nextBlinkDelay', () => {
  it('stays within 4–7 seconds', () => {
    expect(nextBlinkDelay(() => 0)).toBe(4000)
    expect(nextBlinkDelay(() => 0.999)).toBeLessThan(7000)
    expect(nextBlinkDelay(() => 0.5)).toBe(5500)
  })
})
