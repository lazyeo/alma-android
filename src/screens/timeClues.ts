import { currentLocale, t } from '../i18n/runtime'
export type TimeClueRangeName = 'today' | 'this-week' | 'next-week'

export interface TimeClueRange {
  startDate: string
  endDate: string
  timeZone: string
}

export interface TimeClue {
  kind: 'clue'
  id: string
  expression: string
  quote: string
  date: string | null
  endDate: string | null
  time: string | null
  threadId: string
  threadTitle: string
  sourceUri: string
  threadUri?: string
  originalSentAt?: string | number
  originalTimeZone?: string
  seen: boolean
}

export interface ScheduledTimeClue {
  kind: 'scheduled'
  id: string
  jobId: string
  uri: string
  name: string
  dueAt: string
  date: string
  endDate: null
  time: string
  fired: boolean
  threadId?: string
  threadTitle?: string
  threadUri?: string
}

export type TimeClueEntry = TimeClue | ScheduledTimeClue

export interface TimeClueResponse {
  clues: TimeClue[]
  scheduled: ScheduledTimeClue[]
  unread: number
  hasMore: boolean
  nextOffset: number | null
  coverage?: string
  allHistoryIndexed?: boolean
}

const record = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' ? (value as Record<string, any>) : {}
const string = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : fallback
const nullableString = (value: unknown) =>
  typeof value === 'string' && value ? value : null
const DAY = 86_400_000

function dateParts(now: Date, timeZone: string) {
  const fields = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    })
      .formatToParts(now)
      .map((part) => [part.type, part.value]),
  )
  return `${fields.year}-${fields.month}-${fields.day}`
}

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function naturalTimeClueRange(
  name: TimeClueRangeName,
  now = new Date(),
  timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
): TimeClueRange {
  const today = dateParts(now, timeZone)
  if (name === 'today')
    return { startDate: today, endDate: shiftDate(today, 1), timeZone }
  const day = new Date(`${today}T00:00:00Z`).getUTCDay() || 7
  const monday = shiftDate(today, 1 - day + (name === 'next-week' ? 7 : 0))
  return { startDate: monday, endDate: shiftDate(monday, 7), timeZone }
}

export function timeClueRangeId(range: TimeClueRange) {
  return `${range.startDate}..${range.endDate}~${range.timeZone}`
}

function parseClue(value: unknown): TimeClue | undefined {
  const row = record(value)
  const id = string(row.id)
  const threadId = string(row.threadId)
  const sourceUri = string(row.sourceUri)
  if (!id || !threadId || !sourceUri) return undefined
  return {
    kind: 'clue',
    id,
    expression: string(
      row.expression,
      string(row.quote, t('library.timeClues.fallbackTitle')),
    ),
    quote: string(row.quote),
    date: nullableString(row.date),
    endDate: nullableString(row.endDate),
    time: nullableString(row.time),
    threadId,
    threadTitle: string(row.threadTitle, t('common.untitledThread')),
    sourceUri,
    ...(typeof row.threadUri === 'string' ? { threadUri: row.threadUri } : {}),
    ...(typeof row.originalSentAt === 'string' ||
    typeof row.originalSentAt === 'number'
      ? { originalSentAt: row.originalSentAt }
      : {}),
    ...(typeof row.originalTimeZone === 'string'
      ? { originalTimeZone: row.originalTimeZone }
      : {}),
    seen: row.seen === true,
  }
}

function parseScheduled(value: unknown): ScheduledTimeClue | undefined {
  const row = record(value)
  const id = string(row.id)
  const date = string(row.date)
  if (!id || !date) return undefined
  return {
    kind: 'scheduled',
    id,
    jobId: string(row.jobId),
    uri: string(row.uri),
    name: string(row.name, t('library.timeClues.scheduledTask')),
    dueAt: string(row.dueAt),
    date,
    endDate: null,
    time: string(row.time),
    fired: row.fired === true,
    ...(typeof row.threadId === 'string' && row.threadId
      ? { threadId: row.threadId }
      : {}),
    ...(typeof row.threadTitle === 'string' && row.threadTitle
      ? { threadTitle: row.threadTitle }
      : {}),
    ...(typeof row.threadUri === 'string' && row.threadUri
      ? { threadUri: row.threadUri }
      : {}),
  }
}

export function parseTimeClues(value: unknown): TimeClueResponse {
  const input = record(value)
  return {
    clues: (Array.isArray(input.clues) ? input.clues : [])
      .map(parseClue)
      .filter((item): item is TimeClue => Boolean(item)),
    scheduled: (Array.isArray(input.scheduled) ? input.scheduled : [])
      .map(parseScheduled)
      .filter((item): item is ScheduledTimeClue => Boolean(item)),
    unread: Number(input.unread) || 0,
    hasMore: input.hasMore === true,
    nextOffset: Number.isSafeInteger(input.nextOffset)
      ? Number(input.nextOffset)
      : null,
    ...(typeof input.coverage === 'string' ? { coverage: input.coverage } : {}),
    ...(typeof input.allHistoryIndexed === 'boolean'
      ? { allHistoryIndexed: input.allHistoryIndexed }
      : {}),
  }
}

export function timeClueCoversDay(
  clue: Pick<TimeClue, 'date' | 'endDate'>,
  day: string,
) {
  return (
    clue.date !== null && clue.date <= day && (clue.endDate ?? clue.date) >= day
  )
}

export function timeCluesHaveUnread(response: TimeClueResponse, today: string) {
  return response.clues.some(
    (clue) => !clue.seen && timeClueCoversDay(clue, today),
  )
}

export function groupTimeClues(entries: TimeClueEntry[], today?: string) {
  const groups = new Map<string | null, TimeClueEntry[]>()
  for (const entry of entries) {
    const date =
      entry.kind === 'clue' &&
      today &&
      entry.endDate &&
      timeClueCoversDay(entry, today)
        ? today
        : entry.date
    groups.set(date, [...(groups.get(date) ?? []), entry])
  }
  return [...groups]
    .sort(([a], [b]) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)))
    .map(([date, rows]) => ({
      date,
      entries: rows.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? '')),
    }))
}

export function timeClueAnchor(entry: TimeClueEntry) {
  if (entry.kind === 'scheduled')
    return entry.threadId ? { threadId: entry.threadId } : undefined
  const match = /^alma:\/\/thread\/([^/]+)\/message\/([^/?#]+)/.exec(
    entry.sourceUri,
  )
  if (!match) return { threadId: entry.threadId }
  return {
    threadId: decodeURIComponent(match[1]),
    anchorId: decodeURIComponent(match[2]),
  }
}

export function formatTimeClueHeading(date: string | null, today: string) {
  if (!date) return t('library.timeClues.unresolved')
  if (date === today) return t('library.timeClues.today')
  if (date === shiftDate(today, 1)) return t('library.timeClues.tomorrow')
  return new Intl.DateTimeFormat(currentLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

export function timeClueTitle(clue: TimeClue) {
  return clue.expression || clue.quote || t('library.timeClues.fallbackTitle')
}

/** Only conversation clues can be ignored; scheduled tasks have no actions. */
export function timeClueHasActions(entry: TimeClueEntry) {
  return entry.kind === 'clue'
}
