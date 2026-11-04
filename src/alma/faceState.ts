import type { AlmaVitals } from '../screens/personalAgent'

/**
 * Alma's expressions. The raster rig draws every one; the vector fallback
 * folds them into the few it can draw (see `fallbackMood`).
 */
export const FACE_MOODS = [
  'neutral',
  'happy',
  'relaxed',
  'shy',
  'angry',
  'busy',
  'embarrassed',
  'nervous',
  'scared',
  'sleepy',
  'sad',
  'thinking',
  'tired',
] as const
export type FaceMood = (typeof FACE_MOODS)[number]

/**
 * What Alma is doing right now, independent of how she feels: `talking`
 * while her reply streams, `thinking` while other work runs, `waiting` on
 * the user's OK.
 */
export type FaceActivity = 'idle' | 'thinking' | 'waiting' | 'talking'

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

/** Free-text mood words (English and Chinese) → expression. */
const MOOD_WORDS: [RegExp, FaceMood][] = [
  [/shy|bashful|timid|害羞/, 'shy'],
  [/embarrass|awkward|sheepish|尴尬|难堪/, 'embarrassed'],
  [/angry|annoyed|irritat|frustrat|furious|mad\b|grumpy|生气|愤怒|烦/, 'angry'],
  [/scared|afraid|fear|frighten|terrif|害怕|恐惧/, 'scared'],
  [/nervous|anxious|worried|tense|stress|uneasy|紧张|焦虑|担心/, 'nervous'],
  [
    /sad|unhappy|down|lonely|melanchol|upset|gloomy|blue\b|hurt|难过|伤心|委屈/,
    'sad',
  ],
  [/sleepy|drowsy|困/, 'sleepy'],
  [/tired|exhaust|drain|weary|累|疲/, 'tired'],
  [/relax|calm|content|peaceful|serene|chill|cozy|惬意|放松|平静/, 'relaxed'],
  [/happy|cheer|excit|joy|amused|delight|glad|playful|开心|高兴|兴奋/, 'happy'],
  [/busy|focus|working|productive|determined|忙|专注/, 'busy'],
  [/think|curious|pensive|thoughtful|contemplat|ponder|思考|好奇/, 'thinking'],
]
const ASLEEP_LEVEL = /asleep|sleeping/i
const TIRED_LEVEL = /tired|exhaust|drain|weary|drowsy/i

export function moodFromWord(word: string | undefined): FaceMood | undefined {
  const text = word?.trim().toLowerCase()
  if (!text) return undefined
  return MOOD_WORDS.find(([pattern]) => pattern.test(text))?.[1]
}

/**
 * Vitals → expression. Body state wins over emotion: a happy but exhausted
 * Alma looks tired, and at night a low-energy Alma looks sleepy. Then the
 * desktop's own mood word, then valence and energy.
 */
export function faceMoodFromVitals(vitals: AlmaVitals | undefined): FaceMood {
  if (!vitals) return 'neutral'
  const fatigue = unitScale(vitals.fatigue, VITALS_MAX.fatigue)
  const energy = unitScale(vitals.energy, VITALS_MAX.energy)
  const valence = unitScale(vitals.valence, VITALS_MAX.valence)
  const level = vitals.level ?? ''
  if (ASLEEP_LEVEL.test(level)) return 'sleepy'
  const tiredLevel = TIRED_LEVEL.test(level)
  // energy ≤ 4/10, fatigue ≥ 50/100
  const lowEnergy = energy !== undefined && energy <= 0.4
  const weary = (fatigue !== undefined && fatigue >= 0.5) || tiredLevel

  if (vitals.isNight && (lowEnergy || weary)) return 'sleepy'
  // fatigue ≥ 70/100 or energy ≤ 2/10
  if (
    (fatigue !== undefined && fatigue >= 0.7) ||
    (energy !== undefined && energy <= 0.2) ||
    tiredLevel
  )
    return 'tired'
  const worded = moodFromWord(vitals.mood)
  if (worded) return worded
  // valence 5/10 is neutral; 7+ reads as pleased, 3 and below as low
  if (valence !== undefined && valence >= 0.7)
    return lowEnergy ? 'relaxed' : 'happy'
  if (valence !== undefined && valence <= 0.3)
    return energy !== undefined && energy >= 0.7 ? 'nervous' : 'sad'
  // energy ≥ 7/10
  if (energy !== undefined && energy >= 0.7) return 'busy'
  return 'neutral'
}

/** Her reply outranks other work, which outranks a pending question. */
export function faceActivity({
  generating,
  running,
  pendingApprovals,
}: {
  generating: boolean
  running: number
  pendingApprovals: number
}): FaceActivity {
  if (generating) return 'talking'
  if (running > 0) return 'thinking'
  if (pendingApprovals > 0) return 'waiting'
  return 'idle'
}

/** The vector face's five drawable expressions. */
export type FallbackMood =
  'neutral' | 'happy' | 'tired' | 'sleepy-night' | 'focused'

export function fallbackMood(mood: FaceMood): FallbackMood {
  switch (mood) {
    case 'happy':
    case 'relaxed':
    case 'shy':
      return 'happy'
    case 'tired':
    case 'sad':
      return 'tired'
    case 'sleepy':
      return 'sleepy-night'
    case 'busy':
    case 'thinking':
      return 'focused'
    default:
      return 'neutral'
  }
}

/** Random blink spacing: 4–7 s, so the vector face never ticks like a clock. */
export function nextBlinkDelay(random: () => number = Math.random) {
  return 4000 + Math.floor(random() * 3000)
}

export const BLINK_MS = 140
