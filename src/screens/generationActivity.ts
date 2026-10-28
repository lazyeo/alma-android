import type { MessageRow } from '../relay'
import type { PendingAssistant } from './optimisticThread'
import { isTool, toolState } from './streamingPresentation'
import { formatElapsed } from './threadStatus'
import { elapsedDuration } from './toolDurations'
import { t } from '../i18n/runtime'

/** Desktop ActivityOrb copy when no more specific phase is known. */
export const defaultActivityPhase = () => t('message.activity.default')

// Within this distance of the end the list counts as "at latest"; matches
// the slack a momentum scroll typically leaves short of the bottom.
const LATEST_SLACK_PX = 80

/** Short phase label for the persistent generating bar. */
export function activityPhaseText(
  rows: MessageRow[],
  pending?: PendingAssistant,
) {
  if (pending) return pending.phase?.message || t('message.reasoning.thinking')
  const last = [...rows].reverse().find((row) => !row.parentToolCallId)
  if (last?.message.role !== 'assistant') return defaultActivityPhase()
  const tail = last.message.parts.filter((part) => part.type !== 'step-start')
  const current = tail.at(-1)
  if (!current) return defaultActivityPhase()
  if (isTool(current) && toolState(current) === 'running') {
    const name =
      typeof current.toolName === 'string'
        ? current.toolName
        : current.type.replace(/^tool-/, '')
    return t('message.activity.running', { name })
  }
  if (current.type === 'reasoning' && current.state !== 'done')
    return t('message.reasoning.thinking')
  if (current.type === 'text' && current.state !== 'done')
    return t('message.activity.writing')
  return defaultActivityPhase()
}

export function isScrolledAwayFromLatest(metrics: {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}) {
  return (
    metrics.scrollHeight - metrics.scrollTop - metrics.clientHeight >
    LATEST_SLACK_PX
  )
}

export type ActivityBarState =
  { visible: false } | { visible: true; phase: string; elapsed?: string }

export function activityBarState(input: {
  generating: boolean
  rows: MessageRow[]
  pending?: PendingAssistant
  startedAt?: number
  now: number
  documentVisible: boolean
}): ActivityBarState {
  if (!input.generating || !input.documentVisible) return { visible: false }
  return {
    visible: true,
    phase: activityPhaseText(input.rows, input.pending),
    elapsed:
      input.startedAt === undefined
        ? undefined
        : formatElapsed(elapsedDuration(input.now, input.startedAt)),
  }
}
