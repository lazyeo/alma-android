import { clearDraft, type DraftStorage } from './threadDrafts'

const firstSendClaims = new Set<string>()

const firstSendClaimKey = (
  desktopId: string,
  threadId: string,
  messageId: string,
) => `${desktopId}:${threadId}:${messageId}`

export function claimFirstSend(
  desktopId: string,
  threadId: string,
  messageId: string,
) {
  const key = firstSendClaimKey(desktopId, threadId, messageId)
  if (firstSendClaims.has(key)) return false
  firstSendClaims.add(key)
  return true
}

export function releaseFirstSend(
  desktopId: string,
  threadId: string,
  messageId: string,
) {
  const key = firstSendClaimKey(desktopId, threadId, messageId)
  firstSendClaims.delete(key)
}

export interface FirstSendReadiness {
  desktopOnline: boolean
  idleConfirmed: boolean
  socketReady: boolean
  queueMode: 'local' | 'remote' | 'unavailable'
  queueBusy: boolean
  directFailed: boolean
  /** The thread is already replying (e.g. a share into an active thread). */
  generating: boolean
}

export type FirstSendDecision = 'direct' | 'queue' | 'wait'
export type FirstSendResult =
  'sent' | 'queued' | 'wait' | 'direct-failed' | 'queue-failed'

export function clearStartDraftAfterDelivery(
  storage: DraftStorage,
  desktopId: string,
  result: FirstSendResult,
) {
  if (result !== 'sent' && result !== 'queued') return false
  clearDraft(storage, desktopId, '__start__')
  return true
}

export function decideFirstSend(
  readiness: FirstSendReadiness,
): FirstSendDecision {
  // Never hold the message invisibly behind a running reply: queue it like
  // the composer would, so it shows up in the queue and sends afterwards.
  if (readiness.generating)
    return readiness.queueMode !== 'unavailable' && !readiness.queueBusy
      ? 'queue'
      : 'wait'
  if (readiness.directFailed || !readiness.desktopOnline) {
    return readiness.queueMode !== 'unavailable' && !readiness.queueBusy
      ? 'queue'
      : 'wait'
  }
  return readiness.idleConfirmed && readiness.socketReady ? 'direct' : 'wait'
}

export async function deliverFirstSend(
  readiness: FirstSendReadiness,
  actions: {
    sendDirect(): void
    writeQueue(): Promise<boolean>
  },
): Promise<FirstSendResult> {
  const decision = decideFirstSend(readiness)
  if (decision === 'wait') return 'wait'
  if (decision === 'queue')
    return (await actions.writeQueue()) ? 'queued' : 'queue-failed'
  try {
    actions.sendDirect()
    return 'sent'
  } catch {
    return 'direct-failed'
  }
}
