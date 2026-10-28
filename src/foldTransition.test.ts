import { describe, expect, test } from 'vitest'
import {
  FoldMotionFilter,
  FoldTransitionMachine,
  angleProgress,
  defaultFoldTransitionSettings,
  defaultFoldTuning,
  exponentialDecay,
  foldTransitionNativeConfig,
  loadFoldTransitionSettings,
  saveFoldTransitionSettings,
} from './foldTransition'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  }
}

describe('fold transition motion', () => {
  test('maps the activation angle to zero and a closed hinge to one', () => {
    expect(angleProgress(180, 150)).toBe(0)
    expect(angleProgress(150, 150)).toBe(0)
    expect(angleProgress(75, 150)).toBeCloseTo(0.5)
    expect(angleProgress(0, 150)).toBe(1)
  })

  test('low-pass filters angle and reports angular velocity', () => {
    const filter = new FoldMotionFilter(0.25)
    expect(filter.update(180, 1_000)).toEqual({ angle: 180, velocity: 0 })
    const next = filter.update(100, 1_100)
    expect(next.angle).toBe(160)
    expect(next.velocity).toBeCloseTo(-200)
  })

  test('low-pass filters velocity when a velocity smoothing factor is given', () => {
    const filter = new FoldMotionFilter(1, 0.5)
    filter.update(100, 1_000)
    expect(filter.update(110, 1_100).velocity).toBeCloseTo(50)
    expect(filter.update(120, 1_200).velocity).toBeCloseTo(75)
  })

  test('exponential decay approaches zero without becoming negative', () => {
    expect(exponentialDecay(1, 0, 250)).toBe(1)
    expect(exponentialDecay(1, 250, 250)).toBeCloseTo(Math.E ** -1)
    expect(exponentialDecay(1, 10_000, 250)).toBeGreaterThanOrEqual(0)
  })

  test('swap state distinguishes opening and closing settles', () => {
    const machine = new FoldTransitionMachine()
    machine.observe(70, 1_000)
    machine.observe(90, 1_100)
    expect(machine.swap(1_110, 90).direction).toBe('opening')
    expect(machine.frame(1_210, 120).active).toBe(true)

    machine.observe(100, 2_000)
    machine.observe(50, 2_100)
    const closing = machine.swap(2_110, 50)
    expect(closing.direction).toBe('closing')
    expect(machine.frame(2_500, 0).active).toBe(false)
  })

  test('a growing display area means opening even when velocity disagrees', () => {
    const machine = new FoldTransitionMachine()
    machine.observe(100, 1_000)
    machine.observe(90, 1_100)
    expect(machine.swap(1_110, 90, 1).direction).toBe('opening')
    expect(machine.swap(1_200, 90, -1).direction).toBe('closing')
  })

  test('opening clears exponentially with angle and fully at the activation angle', () => {
    const machine = new FoldTransitionMachine({ activationAngle: 150 })
    machine.observe(80, 1_000)
    machine.observe(90, 1_050)
    machine.swap(1_060, 90)
    const start = machine.frame(1_060, 90).strength
    const half = machine.frame(1_100, 120).strength
    expect(start).toBeCloseTo(1)
    expect(half).toBeCloseTo(Math.exp(-defaultFoldTuning.openingDecay / 2))
    expect(machine.frame(1_120, 150).active).toBe(false)
    expect(machine.frame(1_120, 150).strength).toBe(0)
  })

  test('closing clears by time in about closingClearMs', () => {
    const machine = new FoldTransitionMachine()
    machine.observe(100, 1_000)
    machine.observe(60, 1_050)
    machine.swap(1_060, 60)
    expect(machine.frame(1_060 + 125, 40).active).toBe(true)
    expect(machine.frame(1_060 + 250, 40).active).toBe(false)
  })

  test('swapped content uses its final layout from the first frame', () => {
    const machine = new FoldTransitionMachine()
    machine.observe(100, 1_000)
    machine.observe(60, 1_050)
    machine.swap(1_060, 60)
    expect(machine.frame(1_060, 60).aspectRecovery).toBe(1)
    expect(machine.frame(1_160, 60).aspectRecovery).toBe(1)
  })

  test('a hinge resting below the activation angle shows no effect', () => {
    const machine = new FoldTransitionMachine()
    expect(machine.frame(1_000, 0).active).toBe(false)
    machine.observe(0, 1_000)
    machine.observe(0, 2_000)
    expect(machine.frame(2_000, 0).active).toBe(false)
  })

  test('closing motion before the swap ramps with angle progress', () => {
    const machine = new FoldTransitionMachine({ activationAngle: 150 })
    machine.observe(140, 1_000)
    machine.observe(75, 1_100)
    const frame = machine.frame(1_100, 75)
    expect(frame.active).toBe(true)
    expect(frame.strength).toBeCloseTo(0.5)
  })

  test('opening motion before a swap frosts the cover immediately', () => {
    const machine = new FoldTransitionMachine({ activationAngle: 150 })
    machine.observe(0, 1_000)
    machine.observe(10, 1_100)
    const frame = machine.frame(1_100, 10)
    expect(frame.active).toBe(true)
    expect(frame.direction).toBe('opening')
  })

  test('an opening stalled below the activation angle clears after idleClearMs', () => {
    const machine = new FoldTransitionMachine({ activationAngle: 150 })
    machine.observe(80, 1_000)
    machine.observe(90, 1_050)
    machine.swap(1_060, 90)
    machine.observe(100, 1_100)
    machine.observe(100, 1_200)
    const idle = defaultFoldTuning.idleClearMs
    const clear = defaultFoldTuning.closingClearMs
    expect(machine.frame(1_100 + idle - 10, 100).active).toBe(true)
    expect(machine.frame(1_100 + idle + clear, 100).active).toBe(false)
  })

  test('the transition ends after it clears, so later frames stay inactive', () => {
    const machine = new FoldTransitionMachine()
    machine.observe(100, 1_000)
    machine.observe(60, 1_050)
    machine.swap(1_060, 60)
    expect(machine.frame(2_000, 60).active).toBe(false)
    expect(machine.frame(2_010, 60).aspectRecovery).toBe(1)
  })
})

describe('fold transition settings', () => {
  test('defaults to on with logging off and a 150° activation angle', () => {
    expect(defaultFoldTransitionSettings).toEqual({
      enabled: true,
      strength: 0.7,
      activationAngle: 150,
      movingSide: 'left',
      blurSpread: 0.12,
      darkening: 0.015,
      eyeDistanceMm: 450,
      logging: false,
    })
    expect(loadFoldTransitionSettings(memoryStorage())).toEqual(
      defaultFoldTransitionSettings,
    )
  })

  test('round-trips saved settings', () => {
    const storage = memoryStorage()
    const settings = {
      enabled: false,
      strength: 0.4,
      activationAngle: 135,
      movingSide: 'right' as const,
      blurSpread: 0.2,
      darkening: 0.01,
      eyeDistanceMm: 600,
      logging: false,
    }
    saveFoldTransitionSettings(settings, storage)
    expect(loadFoldTransitionSettings(storage)).toEqual(settings)
  })

  test('falls back per field for corrupt or out-of-range storage', () => {
    expect(
      loadFoldTransitionSettings(
        memoryStorage({ 'alma-fold-transition.v1': '{not json' }),
      ),
    ).toEqual(defaultFoldTransitionSettings)
    expect(
      loadFoldTransitionSettings(
        memoryStorage({
          'alma-fold-transition.v1': JSON.stringify({
            enabled: 'yes',
            strength: 7,
            activationAngle: -4,
            logging: false,
          }),
        }),
      ),
    ).toEqual({
      ...defaultFoldTransitionSettings,
      strength: 1,
      activationAngle: 90,
      movingSide: 'left',
      blurSpread: 0.12,
      darkening: 0.015,
      eyeDistanceMm: 450,
      logging: false,
    })
  })

  test('ignores obsolete frost-material keys from stored settings', () => {
    const stored = JSON.stringify({
      enabled: true,
      strength: 0.7,
      activationAngle: 150,
      movingSide: 'left',
      milkiness: 0.9,
      baseBlur: 0.4,
      maxBlurRadiusDp: 70,
      compression: 0.5,
    })
    expect(
      loadFoldTransitionSettings(
        memoryStorage({ 'alma-fold-transition.v1': stored }),
      ),
    ).toEqual(defaultFoldTransitionSettings)
  })

  test('survives unavailable storage', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied')
      },
    }
    expect(loadFoldTransitionSettings(broken)).toEqual(
      defaultFoldTransitionSettings,
    )
  })

  test('native config carries the settings plus every decay constant', () => {
    const config = foldTransitionNativeConfig(defaultFoldTransitionSettings)
    expect(config).toMatchObject({
      enabled: true,
      strength: 0.7,
      activationAngle: 150,
      movingSide: 'left',
      blurSpread: 0.12,
      darkening: 0.015,
      eyeDistanceMm: 450,
      logging: false,
      rampInMs: 180,
      openingClearMs: 400,
      halfOpenHoldMs: 700,
      halfOpenClearMs: 200,
      closingClearMs: 250,
      logIntervalMs: 50,
    })
    for (const key of Object.keys(defaultFoldTuning))
      expect(config).toHaveProperty(key)
  })
})
