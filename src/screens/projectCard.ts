import {
  AlmaHttpError,
  type ProjectCard,
  type ProjectCardConsultTranscript,
  type ProjectCardProposal,
  type ProjectCardResponse,
  type ProjectCardResumeLink,
} from '../relay'

type UnknownRecord = Record<string, unknown>

const record = (value: unknown): UnknownRecord =>
  value && typeof value === 'object' ? (value as UnknownRecord) : {}
const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '')
const optionalText = (value: unknown) => {
  const result = text(value)
  return result || undefined
}

function normalizeResume(value: unknown): ProjectCardResumeLink[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    const link = record(item)
    const uri = text(link.uri)
    const label = text(link.label)
    return uri.startsWith('alma://') && label ? [{ uri, label }] : []
  })
}

function normalizeProposal(value: unknown): ProjectCardProposal | undefined {
  if (!value || typeof value !== 'object') return undefined
  const proposal = record(value)
  const reason = text(proposal.reason)
  const proposedAt = text(proposal.proposedAt)
  if (!reason || !proposedAt) return undefined
  return {
    ...(typeof proposal.brief === 'string'
      ? { brief: text(proposal.brief) }
      : {}),
    ...(typeof proposal.focus === 'string'
      ? { focus: text(proposal.focus) }
      : {}),
    ...(Array.isArray(proposal.resume)
      ? { resume: normalizeResume(proposal.resume) }
      : {}),
    reason,
    proposedAt,
    ...(optionalText(proposal.source)
      ? { source: optionalText(proposal.source) }
      : {}),
  }
}

export function normalizeProjectCardResponse(
  value: unknown,
): ProjectCard | null {
  const cardValue = record(value).card
  if (cardValue == null) return null
  const card = record(cardValue)
  return {
    brief: text(card.brief),
    focus: text(card.focus),
    resume: normalizeResume(card.resume),
    ...(optionalText(card.updatedAt)
      ? { updatedAt: optionalText(card.updatedAt) }
      : {}),
    ...(optionalText(card.confirmedAt)
      ? { confirmedAt: optionalText(card.confirmedAt) }
      : {}),
    ...(normalizeProposal(card.proposal)
      ? { proposal: normalizeProposal(card.proposal) }
      : {}),
  }
}

export function projectCardIsHidden(error: unknown) {
  return error instanceof AlmaHttpError && error.status === 404
}

export function projectCardHeaderSummary(
  card: Pick<ProjectCard, 'brief' | 'focus'> | null,
  emptyText: string,
): { primary: string; secondary?: string } {
  if (!card) return { primary: emptyText }
  if (card.brief)
    return {
      primary: card.brief,
      ...(card.focus ? { secondary: card.focus } : {}),
    }
  if (card.focus) return { primary: card.focus }
  return { primary: emptyText }
}

export function projectCardStatus(card: ProjectCard | null) {
  return card?.proposal ? ('proposal' as const) : undefined
}

export function normalizeProjectCardConsult(
  value: unknown,
): ProjectCardConsultTranscript {
  const transcript = record(record(value).transcript)
  const messages = Array.isArray(transcript.messages)
    ? transcript.messages.flatMap((value) => {
        const message = record(value)
        const id = text(message.id)
        const content = text(message.content)
        const at = text(message.at)
        if (
          !id ||
          !content ||
          !at ||
          (message.role !== 'user' && message.role !== 'assistant')
        )
          return []
        const role: 'user' | 'assistant' = message.role
        return [
          {
            id,
            role,
            content,
            at,
            ...(optionalText(message.model)
              ? { model: optionalText(message.model) }
              : {}),
          },
        ]
      })
    : []
  const summaryValue = record(transcript.summary)
  const summaryText = text(summaryValue.text)
  const throughId = text(summaryValue.throughId)
  const at = text(summaryValue.at)
  const count = summaryValue.count
  return {
    version: 1,
    messages,
    ...(summaryText &&
    throughId &&
    at &&
    typeof count === 'number' &&
    Number.isFinite(count)
      ? { summary: { text: summaryText, throughId, count, at } }
      : {}),
  }
}

export function extractProjectCardError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback
  const json = error.message.match(/:\s*(\{[\s\S]*\})\s*$/)?.[1]
  if (json) {
    try {
      const serverError = record(JSON.parse(json)).error
      if (typeof serverError === 'string' && serverError.trim())
        return serverError.trim()
    } catch {
      // Fall back to the ordinary error message below.
    }
  }
  return error.message || fallback
}

export interface ProjectCardDiff {
  brief?: { before: string; after: string }
  focus?: { before: string; after: string }
  resume: {
    added: ProjectCardResumeLink[]
    removed: ProjectCardResumeLink[]
  }
}

export function diffProjectCard(
  current: Pick<ProjectCard, 'brief' | 'focus' | 'resume'>,
  proposal: ProjectCardProposal,
): ProjectCardDiff {
  const nextResume = proposal.resume ?? current.resume
  const currentUris = new Set(current.resume.map((item) => item.uri))
  const nextUris = new Set(nextResume.map((item) => item.uri))
  return {
    ...(proposal.brief !== undefined && proposal.brief !== current.brief
      ? { brief: { before: current.brief, after: proposal.brief } }
      : {}),
    ...(proposal.focus !== undefined && proposal.focus !== current.focus
      ? { focus: { before: current.focus, after: proposal.focus } }
      : {}),
    resume: {
      added: nextResume.filter((item) => !currentUris.has(item.uri)),
      removed: current.resume.filter((item) => !nextUris.has(item.uri)),
    },
  }
}

export function formatProjectCardRelativeTime(
  value: string,
  now = Date.now(),
  locale = 'en',
) {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return ''
  const delta = timestamp - now
  const units = [
    ['year', 365 * 24 * 60 * 60 * 1000],
    ['month', 30 * 24 * 60 * 60 * 1000],
    ['week', 7 * 24 * 60 * 60 * 1000],
    ['day', 24 * 60 * 60 * 1000],
    ['hour', 60 * 60 * 1000],
    ['minute', 60 * 1000],
  ] as const
  const [unit, size] =
    units.find(([, candidate]) => Math.abs(delta) >= candidate) ??
    (['second', 1000] as const)
  let formatter = projectRelativeFormatters.get(locale)
  if (!formatter) {
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
    projectRelativeFormatters.set(locale, formatter)
  }
  return formatter.format(Math.round(delta / size), unit)
}

const projectRelativeFormatters = new Map<string, Intl.RelativeTimeFormat>()

export function normalizeSavedProjectCard(value: ProjectCardResponse) {
  return normalizeProjectCardResponse(value)
}

/**
 * Whether the expand/collapse toggle under a clamped card field should show.
 * The toggle only makes sense when the clamped paragraph actually overflows
 * (or is already expanded and can be collapsed again); a one-line brief must
 * not offer a "Show more" that does nothing.
 */
export function projectCardNeedsToggle(
  expanded: boolean,
  scrollHeight: number,
  clientHeight: number,
) {
  if (expanded) return true
  return scrollHeight > clientHeight + 1
}
