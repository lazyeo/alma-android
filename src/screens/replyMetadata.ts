import type { MessageRow } from '../relay'
import type { GenerationUsage } from './contextUsage'
import { t } from '../i18n/runtime'

const number = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0

function normalizeUsage(value: unknown): GenerationUsage | undefined {
  if (!value || typeof value !== 'object') return undefined
  const raw = value as Record<string, unknown>
  if (typeof raw.inputTokens !== 'number') return undefined
  const inputTokens = number(raw.inputTokens)
  const outputTokens = number(raw.outputTokens)
  return {
    inputTokens,
    outputTokens,
    totalTokens:
      typeof raw.totalTokens === 'number'
        ? number(raw.totalTokens)
        : inputTokens + outputTokens,
    reasoningTokens: number(raw.reasoningTokens),
    cachedInputTokens: number(raw.cachedInputTokens),
    cacheWriteInputTokens: number(raw.cacheWriteInputTokens),
  }
}

export function usageForReply(
  row: MessageRow,
  completionFallback?: GenerationUsage,
) {
  return normalizeUsage(row.metadata?.usage) ?? completionFallback
}

export type EndReasonPresentation = {
  label: string
  tone: 'warning' | 'error'
}

export function endReasonPresentation(
  value: unknown,
): EndReasonPresentation | undefined {
  if (value === 'length' || value === 'max_tokens')
    return { label: t('message.endReason.length'), tone: 'warning' }
  if (value === 'error' || value === 'failed')
    return { label: t('message.endReason.error'), tone: 'error' }
  return undefined
}

export function replyEndReason(row: MessageRow) {
  return endReasonPresentation(
    row.metadata?.turnEndReason ??
      row.metadata?.finishReason ??
      row.metadata?.stopReason,
  )
}
