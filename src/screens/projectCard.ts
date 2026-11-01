import {
  AlmaHttpError,
  type ProjectCard,
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
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
    Math.round(delta / size),
    unit,
  )
}

export function normalizeSavedProjectCard(value: ProjectCardResponse) {
  return normalizeProjectCardResponse(value)
}
