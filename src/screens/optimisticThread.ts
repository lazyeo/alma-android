import type { MessagePart, MessageRow } from '../relay'
import { messageText } from './messageParts'
import { t } from '../i18n/runtime'

export type OptimisticStatus = 'pending' | 'failed'

export interface PendingAssistant {
  threadId: string
  sentAt: number
  phase?: { kind: 'memory' | 'skill'; message: string }
}

export interface OptimisticThreadState {
  rows: MessageRow[]
  pending?: PendingAssistant
}

export type OptimisticThreadAction =
  | {
      type: 'sent'
      threadId: string
      messageId: string
      parts: MessagePart[]
      sentAt: number
      replaceMessageId?: string
      showPendingAssistant?: boolean
    }
  | { type: 'message_added'; row: MessageRow }
  | { type: 'generation_error'; error: string }
  | { type: 'discard_optimistic'; messageId: string }
  | { type: 'generating_open'; threadId: string; startedAt: number }
  | {
      type: 'phase'
      phase: { kind: 'memory' | 'skill'; message: string }
    }
  | { type: 'assistant_started' }
  | { type: 'sync_rows'; rows: MessageRow[] }
  | { type: 'generation_finished' }

export function createOptimisticThreadState(
  rows: MessageRow[],
): OptimisticThreadState {
  return { rows }
}

export function optimisticUserRow(
  threadId: string,
  messageId: string,
  parts: MessagePart[],
  sentAt: number,
  status: OptimisticStatus = 'pending',
): MessageRow {
  return {
    id: `optimistic:${messageId}`,
    threadId,
    message: { id: messageId, role: 'user', parts },
    timestamp: sentAt,
    createdAt: sentAt,
    updatedAt: sentAt,
    metadata: { optimisticStatus: status },
  }
}

export function retryOptimisticRow(row: MessageRow) {
  return optimisticUserRow(
    row.threadId,
    row.message.id,
    row.message.parts,
    Date.now(),
  )
}

function sameUserMessage(left: MessageRow, right: MessageRow) {
  if (left.message.role !== 'user' || right.message.role !== 'user')
    return false
  if (left.message.id === right.message.id) return true
  return (
    left.metadata?.optimisticStatus === 'pending' &&
    messageText(left.message.parts) === messageText(right.message.parts)
  )
}

function upsertServerRow(rows: MessageRow[], row: MessageRow) {
  const duplicate = rows.findIndex(
    (current) => current.id === row.id || sameUserMessage(current, row),
  )
  if (duplicate < 0) return [...rows, row]
  const next = [...rows]
  next[duplicate] = row
  return next.filter(
    (current, index) =>
      index === duplicate ||
      !(current.id === row.id || sameUserMessage(current, row)),
  )
}

function assistantHasContent(rows: MessageRow[]) {
  const lastRoot = [...rows].reverse().find((row) => !row.parentToolCallId)
  return (
    lastRoot?.message.role === 'assistant' &&
    lastRoot.message.parts.some(
      (part) =>
        Boolean(part.text) ||
        part.type.startsWith('tool-') ||
        part.type === 'dynamic-tool',
    )
  )
}

function syncFetchedRows(current: MessageRow[], fetched: MessageRow[]) {
  const optimistic = current.filter((row) => row.id.startsWith('optimistic:'))
  if (!optimistic.length) return fetched
  return optimistic.reduce(
    (rows, row) =>
      rows.some((serverRow) => sameUserMessage(row, serverRow))
        ? rows
        : [...rows, row],
    fetched,
  )
}

export function optimisticThreadReducer(
  state: OptimisticThreadState,
  action: OptimisticThreadAction,
): OptimisticThreadState {
  if (action.type === 'sent') {
    const row = optimisticUserRow(
      action.threadId,
      action.messageId,
      action.parts,
      action.sentAt,
    )
    const replaceIndex = action.replaceMessageId
      ? state.rows.findIndex(
          (current) => current.id === action.replaceMessageId,
        )
      : -1
    const existingOptimistic = state.rows.findIndex(
      (current) => current.message.id === action.messageId,
    )
    return {
      rows:
        existingOptimistic >= 0
          ? state.rows.map((current, index) =>
              index === existingOptimistic ? row : current,
            )
          : replaceIndex < 0
            ? [...state.rows, row]
            : [...state.rows.slice(0, replaceIndex), row],
      pending:
        action.showPendingAssistant === false
          ? state.pending
          : {
              threadId: action.threadId,
              sentAt: action.sentAt,
              phase: undefined,
            },
    }
  }

  if (action.type === 'message_added') {
    return {
      rows: upsertServerRow(state.rows, action.row),
      pending:
        action.row.message.role === 'assistant' &&
        action.row.message.parts.length > 0
          ? undefined
          : state.pending,
    }
  }

  if (action.type === 'discard_optimistic') {
    return {
      rows: state.rows.filter(
        (row) =>
          !(
            row.id.startsWith('optimistic:') &&
            row.message.id === action.messageId
          ),
      ),
      pending: undefined,
    }
  }

  if (action.type === 'generation_error') {
    return {
      rows: state.rows.map((row) =>
        row.metadata?.optimisticStatus === 'pending'
          ? {
              ...row,
              metadata: {
                ...row.metadata,
                optimisticStatus: 'failed' satisfies OptimisticStatus,
                optimisticError: action.error,
              },
            }
          : row,
      ),
      pending: undefined,
    }
  }

  if (action.type === 'generating_open') {
    if (assistantHasContent(state.rows) || state.pending) return state
    return {
      ...state,
      pending: {
        threadId: action.threadId,
        sentAt: action.startedAt,
        phase: undefined,
      },
    }
  }

  if (action.type === 'sync_rows') {
    const rows = syncFetchedRows(state.rows, action.rows)
    return {
      rows,
      pending: assistantHasContent(rows) ? undefined : state.pending,
    }
  }

  if (action.type === 'phase') {
    return state.pending
      ? { ...state, pending: { ...state.pending, phase: action.phase } }
      : state
  }

  if (
    action.type === 'assistant_started' ||
    action.type === 'generation_finished'
  ) {
    return { ...state, pending: undefined }
  }

  return state
}

export function pendingStatusText(
  pending: PendingAssistant | undefined,
  now: number,
) {
  if (!pending) return ''
  if (pending.phase?.message) return pending.phase.message
  return t('message.activity.thinkingFor', {
    seconds: Math.max(0, Math.floor((now - pending.sentAt) / 1000)),
  })
}

export function phaseFromProgressEvent(
  type: string,
  data: unknown,
): PendingAssistant['phase'] | undefined {
  const value = data as { message?: unknown; stage?: unknown } | undefined
  if (type === 'memory_retrieval_progress') {
    return {
      kind: 'memory',
      message:
        typeof value?.message === 'string' && value.message.trim()
          ? value.message
          : t('message.activity.memories'),
    }
  }
  if (type === 'skill_analysis_progress') {
    return {
      kind: 'skill',
      message:
        typeof value?.message === 'string' && value.message.trim()
          ? value.message
          : t('message.activity.skills'),
    }
  }
  return undefined
}
