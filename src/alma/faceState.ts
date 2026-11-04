import type { AlmaVitals } from '../screens/personalAgent'

/** The handful of expressions the vector character can draw. */
export type FaceMood =
  'neutral' | 'happy' | 'tired' | 'sleepy-night' | 'focused'

/** What Alma is doing right now, independent of how she feels. */
export type FaceActivity = 'idle' | 'thinking' | 'waiting'

export interface FaceState {
  mood: FaceMood
  activity: FaceActivity
}

/** Desktop vitals scales: energy and valence 0–10, fatigue 0–100. */
export const VITALS_MAX = { energy: 10, valence: 10, fatigue: 100 } as const

/** A reading on its known 0..max scale as 0..1; junk or absence → undefined. */
export function unitScale(
  value: number | undefined,
  max: number,
): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  return Math.max(0, Math.min(1, value / max))
}

const POSITIVE_MOODS = new Set([
  'happy',
  'cheerful',
  'excited',
  'amused',
  'content',
])
const ASLEEP_LEVEL = /asleep|sleeping/i
const TIRED_LEVEL = /tired|exhaust|drain|weary|drowsy/i

/**
 * Vitals → expression. Body state wins over emotion: a happy but exhausted
 * Alma looks tired, and at night a low-energy Alma looks sleepy.
 */
export function faceMoodFromVitals(vitals: AlmaVitals | undefined): FaceMood {
  if (!vitals) return 'neutral'
  const fatigue = unitScale(vitals.fatigue, VITALS_MAX.fatigue)
  const energy = unitScale(vitals.energy, VITALS_MAX.energy)
  const valence = unitScale(vitals.valence, VITALS_MAX.valence)
  const level = vitals.level ?? ''
  if (ASLEEP_LEVEL.test(level)) return 'sleepy-night'
  const tiredLevel = TIRED_LEVEL.test(level)
  const mood = vitals.mood?.trim().toLowerCase()
  // energy ≤ 4/10, fatigue ≥ 50/100
  const lowEnergy = energy !== undefined && energy <= 0.4
  const weary = (fatigue !== undefined && fatigue >= 0.5) || tiredLevel

  if (vitals.isNight && (lowEnergy || weary)) return 'sleepy-night'
  // fatigue ≥ 70/100 or energy ≤ 2/10
  if (
    (fatigue !== undefined && fatigue >= 0.7) ||
    (energy !== undefined && energy <= 0.2) ||
    tiredLevel
  )
    return 'tired'
  // valence 5/10 is neutral; 7+ reads as pleased
  if (
    (mood && POSITIVE_MOODS.has(mood)) ||
    (valence !== undefined && valence >= 0.7)
  )
    return 'happy'
  // energy ≥ 7/10
  if (energy !== undefined && energy >= 0.7) return 'focused'
  return 'neutral'
}

/** Live work outranks a pending question: she is busy before she is waiting. */
export function faceActivity({
  generating,
  running,
  pendingApprovals,
}: {
  generating: boolean
  running: number
  pendingApprovals: number
}): FaceActivity {
  if (generating || running > 0) return 'thinking'
  if (pendingApprovals > 0) return 'waiting'
  return 'idle'
}

/** Random blink spacing: 4–7 s, so the character never ticks like a clock. */
export function nextBlinkDelay(random: () => number = Math.random) {
  return 4000 + Math.floor(random() * 3000)
}

export const BLINK_MS = 140
