import type { Translator } from '../i18n/core'
import type { Messages } from '../i18n/en'

/** The parts of `GET /api/personal` (desktop 0.4.407+) the Threads row shows. */
export interface PersonalAgentSnapshot {
  threadId: string | null
  today: { spentUsd: number; budgetUsd: number | null; over: boolean }
  running: number
  pendingApprovals: number
}

/** `GET /api/alma/vitals`; `mood` is absent once the base emotion expires. */
export interface AlmaVitals {
  fatigue?: number
  level?: string
  isNight?: boolean
  mood?: string
  energy?: number
  valence?: number
  updated?: string
}

export type PersonalAgentResult =
  { status: 'ok'; personal: PersonalAgentSnapshot } | { status: 'unsupported' }

export type AlmaVitalsResult =
  { status: 'ok'; vitals: AlmaVitals } | { status: 'unsupported' }

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
const finite = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
const count = (value: unknown) => Math.max(0, Math.floor(finite(value) ?? 0))

export function parsePersonalAgent(value: unknown): PersonalAgentSnapshot {
  const body = record(value)
  const today = record(body.today)
  const threadId =
    typeof body.threadId === 'string' && body.threadId ? body.threadId : null
  return {
    threadId,
    today: {
      spentUsd: Math.max(0, finite(today.spentUsd) ?? 0),
      budgetUsd: finite(today.budgetUsd) ?? null,
      over: today.over === true,
    },
    running: count(body.running),
    pendingApprovals: count(body.pendingApprovals),
  }
}

export function parseAlmaVitals(value: unknown): AlmaVitals {
  const body = record(value)
  const vitals: AlmaVitals = {}
  for (const key of ['fatigue', 'energy', 'valence'] as const) {
    const number = finite(body[key])
    if (number !== undefined) vitals[key] = number
  }
  for (const key of ['level', 'mood', 'updated'] as const)
    if (typeof body[key] === 'string' && body[key]) vitals[key] = body[key]
  if (typeof body.isNight === 'boolean') vitals.isNight = body.isNight
  return vitals
}

// The desktop's emotion prompt asks for one of these words; anything else is
// free text we cannot translate, so the subtitle leaves it out.
const KNOWN_MOODS = [
  'happy',
  'excited',
  'amused',
  'content',
  'neutral',
  'bored',
  'annoyed',
  'sad',
  'upset',
  'angry',
] as const
type KnownMood = (typeof KNOWN_MOODS)[number]

const isKnownMood = (value: string): value is KnownMood =>
  (KNOWN_MOODS as readonly string[]).includes(value)

export function personalMoodLabel(
  mood: string | undefined,
  t: Translator<Messages>,
) {
  const key = mood?.trim().toLowerCase() ?? ''
  return isKnownMood(key) ? t(`threads.personal.mood.${key}`) : undefined
}

export interface PersonalSubtitlePart {
  kind: 'mood' | 'running' | 'approvals' | 'spend'
  text: string
  emphasized?: true
}

const usd = (value: number) => `$${value.toFixed(2)}`

/** Status fragments for the row, each shown only when it carries signal. */
export function personalAgentSubtitle(
  personal: Pick<
    PersonalAgentSnapshot,
    'running' | 'pendingApprovals' | 'today'
  >,
  mood: string | undefined,
  t: Translator<Messages>,
): PersonalSubtitlePart[] {
  const parts: PersonalSubtitlePart[] = []
  const moodLabel = personalMoodLabel(mood, t)
  if (moodLabel) parts.push({ kind: 'mood', text: moodLabel })
  if (personal.running > 0)
    parts.push({
      kind: 'running',
      text: t('threads.personal.running', { count: personal.running }),
    })
  if (personal.pendingApprovals > 0)
    parts.push({
      kind: 'approvals',
      text: t('threads.personal.approvals', {
        count: personal.pendingApprovals,
      }),
      emphasized: true,
    })
  const { spentUsd, budgetUsd } = personal.today
  if (spentUsd > 0)
    parts.push({
      kind: 'spend',
      text:
        budgetUsd !== null
          ? `${usd(spentUsd)} / ${usd(budgetUsd)}`
          : usd(spentUsd),
    })
  return parts
}
