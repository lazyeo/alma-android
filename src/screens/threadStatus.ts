import type { MessageRow } from '../relay'
import type { ThreadGtdStatus } from './threadGtd'
import { t } from '../i18n/runtime'

export type ThreadRowStatusKind = 'generating' | 'naming' | 'queued' | 'draft'
export interface ThreadRowStatus {
  kind: ThreadRowStatusKind
  label: string
}

export type PrimaryThreadMark =
  'generating' | 'response' | 'todo' | 'in_progress' | 'unread'

export function primaryThreadMark(input: {
  generating: boolean
  needsResponse: boolean
  gtdStatus: ThreadGtdStatus
  pendingTodoDone?: boolean
  unread: boolean
}): PrimaryThreadMark | undefined {
  if (input.generating) return 'generating'
  if (input.needsResponse) return 'response'
  if (input.pendingTodoDone) return 'todo'
  if (input.gtdStatus === 'todo' || input.gtdStatus === 'in_progress')
    return input.gtdStatus
  if (input.unread) return 'unread'
  return undefined
}

/** Row badges in priority order: live work first, local state last. */
export function threadRowStatuses(input: {
  generating: boolean
  namingTitle: boolean
  queuedCount: number
  hasDraft: boolean
}): ThreadRowStatus[] {
  const statuses: ThreadRowStatus[] = []
  if (input.generating)
    statuses.push({ kind: 'generating', label: t('thread.generating') })
  if (input.namingTitle)
    statuses.push({ kind: 'naming', label: t('threads.row.naming') })
  if (input.queuedCount > 0)
    statuses.push({
      kind: 'queued',
      label: t('threads.row.queued', { count: input.queuedCount }),
    })
  if (input.hasDraft)
    statuses.push({ kind: 'draft', label: t('threads.row.draft') })
  return statuses
}

const pad = (value: number) => String(value).padStart(2, '0')

export function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  if (hours) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  if (minutes) return `${minutes}:${pad(seconds)}`
  return `${seconds}s`
}

/**
 * Best-known start of a running generation. A thread opened mid-run has no
 * start event, so the latest user message stands in; clock skew (a future
 * timestamp) falls back to when the run was first observed.
 */
export function generationStartedAt(rows: MessageRow[], observedAt: number) {
  for (let index = rows.length - 1; index >= 0; index--) {
    const row = rows[index]
    if (row.message.role !== 'user') continue
    const time = row.timestamp
    return typeof time === 'number' && time <= observedAt ? time : observedAt
  }
  return observedAt
}
