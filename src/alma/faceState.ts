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

// The desktop reports vitals on more than one scale (0..1 fractions and
// 0..10 scores both occur), so every number is folded into 0..1 first.
export function unitScale(value: number | undefined): number | undefined {
  if (value === undefined || !Number.isFinite(value)) return undefined
  const magnitude = Math.abs(value)
  const scaled =
    magnitude > 10 ? value / 100 : magnitude > 1 ? value / 10 : value
  return Math.max(-1, Math.min(1, scaled))
}

const POSITIVE_MOODS = new Set(['happy', 'excited', 'amused', 'content'])
const TIRED_LEVEL = /tired|exhaust|drain|sleep|weary/i

/**
 * Vitals → expression. Body state wins over emotion: a happy but exhausted
 * Alma looks tired, and at night a low-energy Alma looks sleepy.
 */
export function faceMoodFromVitals(vitals: AlmaVitals | undefined): FaceMood {
  if (!vitals) return 'neutral'
  const fatigue = unitScale(vitals.fatigue)
  const energy = unitScale(vitals.energy)
  const valence = unitScale(vitals.valence)
  const tiredLevel = vitals.level ? TIRED_LEVEL.test(vitals.level) : false
  const mood = vitals.mood?.trim().toLowerCase()
  const lowEnergy = energy !== undefined && energy <= 0.4
  const weary = (fatigue !== undefined && fatigue >= 0.5) || tiredLevel

  if (vitals.isNight && (lowEnergy || weary)) return 'sleepy-night'
  if (
    (fatigue !== undefined && fatigue >= 0.7) ||
    (energy !== undefined && energy <= 0.25) ||
    tiredLevel
  )
    return 'tired'
  if (
    (mood && POSITIVE_MOODS.has(mood)) ||
    (valence !== undefined && valence >= 0.5)
  )
    return 'happy'
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
