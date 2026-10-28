// Settings, tuning constants, and a simplified reference of the native fold
// strength formulas. The web app never renders the effect; it owns the
// settings and constants. What actually runs is FoldTransitionModel.java,
// which has its own JUnit tests (hinge filtering, swap detection, strength);
// this machine uses unfiltered velocity and no swap detection, so keep only
// the shared formulas in step.

export type FoldDirection = 'opening' | 'closing'

export type FoldTransitionSettings = {
  enabled: boolean
  /** Multiplier on the ray-cast glass tilt (0.1–1). */
  strength: number
  /** Hinge angle (degrees) at and above which the effect is fully clear. */
  activationAngle: number
  /** Inner panel that rotates around the hinge. */
  movingSide: 'left' | 'right'
  /** Blur radius gained per pixel of glass/plane separation. */
  blurSpread: number
  /** Light lost per pixel of blur radius at the reference density. */
  darkening: number
  /** Viewer distance from the flat UI plane. */
  eyeDistanceMm: number
  /** Writes `AlmaFold` lines to logcat. */
  logging: boolean
}

export const defaultFoldTransitionSettings: FoldTransitionSettings = {
  enabled: true,
  strength: 0.7,
  activationAngle: 150,
  movingSide: 'left',
  blurSpread: 0.12,
  darkening: 0.015,
  eyeDistanceMm: 450,
  logging: false,
}

/** Decay and sampling constants; sent to native so tuning needs no rebuild. */
export const defaultFoldTuning = {
  /** Low-pass factor for the hinge angle per sensor event (1 = unfiltered). */
  angleSmoothing: 0.22,
  /** Low-pass factor for angular velocity per sensor event. */
  velocitySmoothing: 0.35,
  /** Stepped sensor/posture ramp to full frost. */
  rampInMs: 180,
  /** Inner display clear after posture becomes flat. */
  openingClearMs: 400,
  /** Half-open frost hold before it clears without a swap. */
  halfOpenHoldMs: 700,
  /** Half-open timeout fade duration. */
  halfOpenClearMs: 200,
  /** Continuous-angle opening clear exponent. */
  openingDecay: 4,
  /** Closing clears by time; strength reaches the epsilon after this long. */
  closingClearMs: 250,
  /** A hinge that stops moving for this long starts a closing-style clear. */
  idleClearMs: 600,
  /** Angular speed (°/s) that counts as hinge motion. */
  motionVelocity: 15,
  /** Minimum spacing between `AlmaFold` angle log lines. */
  logIntervalMs: 50,
  /** Length of the Settings preview. */
  previewMs: 3000,
}

export type FoldTuning = typeof defaultFoldTuning
export type FoldTransitionNativeConfig = FoldTransitionSettings & FoldTuning

/** Below this the effect is visually gone and the frame loop may stop. */
export const FOLD_ACTIVE_EPSILON = 0.02
// exp(-4) ≈ 0.018 < FOLD_ACTIVE_EPSILON, so a time constant of a quarter of
// a "clear in N ms" budget reaches the epsilon right at N ms.
const CLEAR_TIME_CONSTANTS = 4

const STORAGE_KEY = 'alma-fold-transition.v1'
export const FOLD_ACTIVATION_RANGE = [90, 175] as const
export const FOLD_STRENGTH_RANGE = [0.1, 1] as const
export const FOLD_BLUR_SPREAD_RANGE = [0.01, 0.5] as const
export const FOLD_DARKENING_RANGE = [0, 0.05] as const
export const FOLD_EYE_DISTANCE_RANGE = [100, 1200] as const

const clamp = (value: number, [min, max]: readonly [number, number]) =>
  Math.min(max, Math.max(min, value))

function normalizeSettings(value: unknown): FoldTransitionSettings {
  const input =
    value && typeof value === 'object'
      ? (value as Partial<Record<keyof FoldTransitionSettings, unknown>>)
      : {}
  const defaults = defaultFoldTransitionSettings
  const bool = (field: unknown, fallback: boolean) =>
    typeof field === 'boolean' ? field : fallback
  const number = (
    field: unknown,
    fallback: number,
    range: readonly [number, number],
  ) =>
    typeof field === 'number' && Number.isFinite(field)
      ? clamp(field, range)
      : fallback
  return {
    enabled: bool(input.enabled, defaults.enabled),
    strength: number(input.strength, defaults.strength, FOLD_STRENGTH_RANGE),
    activationAngle: number(
      input.activationAngle,
      defaults.activationAngle,
      FOLD_ACTIVATION_RANGE,
    ),
    movingSide:
      input.movingSide === 'left' || input.movingSide === 'right'
        ? input.movingSide
        : defaults.movingSide,
    blurSpread: number(
      input.blurSpread,
      defaults.blurSpread,
      FOLD_BLUR_SPREAD_RANGE,
    ),
    darkening: number(
      input.darkening,
      defaults.darkening,
      FOLD_DARKENING_RANGE,
    ),
    eyeDistanceMm: number(
      input.eyeDistanceMm,
      defaults.eyeDistanceMm,
      FOLD_EYE_DISTANCE_RANGE,
    ),
    logging: bool(input.logging, defaults.logging),
  }
}

export function loadFoldTransitionSettings(
  storage: Pick<Storage, 'getItem'> = localStorage,
): FoldTransitionSettings {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    return normalizeSettings(raw ? JSON.parse(raw) : undefined)
  } catch {
    // Unreadable storage or corrupt JSON: the defaults are a safe, visible state.
    return { ...defaultFoldTransitionSettings }
  }
}

/** Throws when storage is unavailable so the caller can show the error. */
export function saveFoldTransitionSettings(
  settings: FoldTransitionSettings,
  storage: Pick<Storage, 'setItem'> = localStorage,
) {
  storage.setItem(STORAGE_KEY, JSON.stringify(normalizeSettings(settings)))
}

export function foldTransitionNativeConfig(
  settings: FoldTransitionSettings,
  tuning: FoldTuning = defaultFoldTuning,
): FoldTransitionNativeConfig {
  return { ...tuning, ...normalizeSettings(settings) }
}

export function angleProgress(angle: number, activationAngle: number) {
  if (!Number.isFinite(angle) || !Number.isFinite(activationAngle)) return 0
  const threshold = Math.max(1, activationAngle)
  return Math.min(1, Math.max(0, (threshold - angle) / threshold))
}

export function exponentialDecay(
  start: number,
  elapsedMs: number,
  timeConstantMs: number,
) {
  if (start <= 0) return 0
  const elapsed = Math.max(0, elapsedMs)
  const timeConstant = Math.max(1, timeConstantMs)
  return Math.max(0, start * Math.exp(-elapsed / timeConstant))
}

export class FoldMotionFilter {
  private angle?: number
  private velocity = 0
  private timeMs?: number

  constructor(
    private readonly alpha = defaultFoldTuning.angleSmoothing,
    private readonly velocityAlpha = 1,
  ) {}

  update(rawAngle: number, timeMs: number) {
    if (this.angle === undefined || this.timeMs === undefined) {
      this.angle = rawAngle
      this.timeMs = timeMs
      return { angle: rawAngle, velocity: 0 }
    }
    const elapsedSeconds = Math.max(0.001, (timeMs - this.timeMs) / 1_000)
    const previous = this.angle
    this.angle = previous + (rawAngle - previous) * this.alpha
    this.timeMs = timeMs
    const rawVelocity = (this.angle - previous) / elapsedSeconds
    this.velocity += (rawVelocity - this.velocity) * this.velocityAlpha
    return { angle: this.angle, velocity: this.velocity }
  }
}

export type FoldTransitionFrame = {
  active: boolean
  direction: FoldDirection
  /** Normalised effect strength (0–1) before the user strength multiplier. */
  strength: number
  /** Always 1: the new display's full layout is visible from its first frame. */
  aspectRecovery: number
}

export class FoldTransitionMachine {
  private previousAngle = 180
  private velocity = 0
  private previousTimeMs?: number
  private lastMotionMs?: number
  private lastClosingMs?: number
  private swapTimeMs?: number
  private swapAngle = 0
  private direction: FoldDirection = 'closing'
  private readonly activationAngle: number
  private readonly tuning: FoldTuning

  constructor(
    options: { activationAngle?: number; tuning?: Partial<FoldTuning> } = {},
  ) {
    this.activationAngle =
      options.activationAngle ?? defaultFoldTransitionSettings.activationAngle
    this.tuning = { ...defaultFoldTuning, ...options.tuning }
  }

  observe(angle: number, timeMs: number) {
    if (this.previousTimeMs !== undefined) {
      const seconds = Math.max(0.001, (timeMs - this.previousTimeMs) / 1_000)
      this.velocity = (angle - this.previousAngle) / seconds
      if (Math.abs(this.velocity) >= this.tuning.motionVelocity) {
        this.lastMotionMs = timeMs
        this.direction = this.velocity > 0 ? 'opening' : 'closing'
        if (this.velocity < 0) this.lastClosingMs = timeMs
      }
    }
    this.previousAngle = angle
    this.previousTimeMs = timeMs
  }

  /**
   * Direction comes from the display area change (the inner display is
   * larger); a zero change falls back to hinge velocity.
   */
  swap(timeMs: number, angle: number, areaChange = 0) {
    const opening = areaChange !== 0 ? areaChange > 0 : this.velocity >= 0
    this.direction = opening ? 'opening' : 'closing'
    this.previousAngle = angle
    this.swapAngle = angle
    this.swapTimeMs = timeMs
    return { direction: this.direction, angle }
  }

  frame(timeMs: number, angle: number): FoldTransitionFrame {
    if (this.swapTimeMs === undefined) return this.preSwapFrame(timeMs, angle)
    const elapsed = Math.max(0, timeMs - this.swapTimeMs)
    const strength =
      this.direction === 'opening'
        ? this.openingStrength(timeMs, angle)
        : exponentialDecay(1, elapsed, this.clearTimeConstant())
    const active = strength >= FOLD_ACTIVE_EPSILON
    // The transition is over once clear; later frames start from rest again.
    if (!active) this.swapTimeMs = undefined
    return {
      active,
      direction: this.direction,
      strength: active ? strength : 0,
      aspectRecovery: 1,
    }
  }

  /** Before a swap the currently moving panel frosts in either direction. */
  private preSwapFrame(timeMs: number, angle: number): FoldTransitionFrame {
    const lastDirectionalMotion =
      this.direction === 'opening' ? this.lastMotionMs : this.lastClosingMs
    const motion =
      lastDirectionalMotion === undefined
        ? 0
        : exponentialDecay(
            1,
            timeMs - lastDirectionalMotion,
            this.tuning.idleClearMs / CLEAR_TIME_CONSTANTS,
          )
    const strength = angleProgress(angle, this.activationAngle) * motion
    const active = strength >= FOLD_ACTIVE_EPSILON
    return {
      active,
      direction: this.direction,
      strength: active ? strength : 0,
      aspectRecovery: 1,
    }
  }

  private openingStrength(timeMs: number, angle: number) {
    if (angle >= this.activationAngle) return 0
    const span = Math.max(1, this.activationAngle - this.swapAngle)
    const progress = Math.min(1, Math.max(0, (angle - this.swapAngle) / span))
    const byAngle = Math.exp(-this.tuning.openingDecay * progress)
    // A hinge left half-open must not stay blurred: after idleClearMs without
    // motion the remaining strength clears like a closing transition.
    const idleMs = timeMs - (this.lastMotionMs ?? this.swapTimeMs ?? timeMs)
    const byIdle = exponentialDecay(
      1,
      idleMs - this.tuning.idleClearMs,
      this.clearTimeConstant(),
    )
    return byAngle * byIdle
  }

  private clearTimeConstant() {
    return this.tuning.closingClearMs / CLEAR_TIME_CONSTANTS
  }
}
