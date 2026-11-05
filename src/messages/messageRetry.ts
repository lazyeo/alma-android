/**
 * Which retry the message actions offer for a row, matching the desktop's
 * message menu:
 *
 * - an assistant reply retries itself (`retryOfMessageId`: a new version in
 *   the same slot; the old reply stays reachable with the version switcher);
 * - the user's own message retries the reply that follows it, or, when it is
 *   the last message (the reply never came or failed before it was stored),
 *   asks for a reply from the end of the conversation (`regenerate`);
 * - a send that failed before the desktop stored it is resent as is.
 *
 * Nothing is discarded by any of these, so none of them asks to confirm.
 */
export type MessageRetry =
  | { kind: 'retryReply'; messageId: string }
  | { kind: 'regenerate' }
  | { kind: 'resend' }

interface RetryRow {
  id: string
  message: { role: string }
  metadata?: { optimisticStatus?: unknown; [key: string]: unknown }
}

function isLocalOnly(row: RetryRow) {
  return (
    row.id.startsWith('optimistic:') ||
    row.metadata?.optimisticStatus !== undefined
  )
}

export function messageRetry(
  rows: readonly RetryRow[],
  row: RetryRow,
): MessageRetry | undefined {
  const status = row.metadata?.optimisticStatus
  if (row.message.role === 'user' && status === 'failed')
    return { kind: 'resend' }
  if (isLocalOnly(row)) return undefined
  if (row.message.role === 'assistant')
    return { kind: 'retryReply', messageId: row.id }
  if (row.message.role !== 'user') return undefined
  const index = rows.findIndex((candidate) => candidate.id === row.id)
  if (index < 0) return undefined
  const next = rows[index + 1]
  if (!next) return { kind: 'regenerate' }
  if (next.message.role === 'assistant' && !isLocalOnly(next))
    return { kind: 'retryReply', messageId: next.id }
  return undefined
}
