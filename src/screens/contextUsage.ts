import type { RealtimeEvent } from '../relay'

type ThreadEvent = Pick<RealtimeEvent, 'type' | 'data'>

/** Shape of GET /api/threads/:threadId/context-usage and its realtime update. */
export interface ContextUsage {
  threadId: string
  usagePercent: number
  totalTokens: number
  contextWindow: number
}

/** Exact `usage` fields Desktop sends on `generation_completed`. */
export interface GenerationUsage {
  inputTokens: number
  outputTokens: number
  totalTokens: number
  reasoningTokens: number
  cachedInputTokens: number
  cacheWriteInputTokens: number
}

export interface SessionUsage extends GenerationUsage {
  turns: number
}

export type ContextLevel = 'ok' | 'warn' | 'danger'

export const CONTEXT_WARN_PERCENT = 70
export const CONTEXT_DANGER_PERCENT = 90

export function contextLevel(percent: number): ContextLevel {
  if (percent >= CONTEXT_DANGER_PERCENT) return 'danger'
  if (percent >= CONTEXT_WARN_PERCENT) return 'warn'
  return 'ok'
}

export function pieSectorPath(percent: number) {
  const clamped = Number.isFinite(percent)
    ? Math.min(100, Math.max(0, percent))
    : 0
  if (clamped <= 0) return ''
  const center = 10
  const radius = 9
  const angle = (clamped / 100) * Math.PI * 2 - Math.PI / 2
  const x = center + radius * Math.cos(angle)
  const y = center + radius * Math.sin(angle)
  const point = (value: number) => String(Number(value.toFixed(3)))
  if (clamped >= 100) return 'M 10 10 L 10 1 A 9 9 0 1 1 9.999 1 Z'
  return `M 10 10 L 10 1 A 9 9 0 ${clamped > 50 ? 1 : 0} 1 ${point(x)} ${point(y)} Z`
}

const trim = (value: number, digits: number) =>
  String(Number(value.toFixed(digits)))

export function formatTokens(value: number) {
  if (value >= 1_000_000) return `${trim(value / 1_000_000, 2)}M`
  if (value >= 1_000) return `${trim(value / 1_000, value >= 100_000 ? 0 : 1)}k`
  return String(Math.round(value))
}

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

export function applyContextUsageEvent<T extends ContextUsage | undefined>(
  current: T,
  threadId: string,
  event: ThreadEvent,
): ContextUsage | T {
  const data = event.data
  if (
    event.type !== 'context_usage_update' ||
    data?.threadId !== threadId ||
    !isNumber(data.usagePercent) ||
    !isNumber(data.totalTokens)
  )
    return current
  return {
    threadId,
    usagePercent: data.usagePercent,
    totalTokens: data.totalTokens,
    contextWindow: isNumber(data.contextWindow)
      ? data.contextWindow
      : (current?.contextWindow ?? 0),
  }
}

export function usageFromCompletion(
  threadId: string,
  event: ThreadEvent,
): { assistantMessageId?: string; usage: GenerationUsage } | undefined {
  const data = event.data
  const raw = data?.usage
  if (
    event.type !== 'generation_completed' ||
    data?.threadId !== threadId ||
    !raw ||
    !isNumber(raw.inputTokens)
  )
    return undefined
  const field = (key: keyof GenerationUsage) =>
    isNumber(raw[key]) ? raw[key] : 0
  const inputTokens = field('inputTokens')
  const outputTokens = field('outputTokens')
  return {
    ...(typeof data.assistantMessageId === 'string'
      ? { assistantMessageId: data.assistantMessageId }
      : {}),
    usage: {
      inputTokens,
      outputTokens,
      totalTokens: isNumber(raw.totalTokens)
        ? raw.totalTokens
        : inputTokens + outputTokens,
      reasoningTokens: field('reasoningTokens'),
      cachedInputTokens: field('cachedInputTokens'),
      cacheWriteInputTokens: field('cacheWriteInputTokens'),
    },
  }
}

export const emptySessionUsage: SessionUsage = Object.freeze({
  turns: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  reasoningTokens: 0,
  cachedInputTokens: 0,
  cacheWriteInputTokens: 0,
})

export function accumulateSessionUsage(
  total: SessionUsage,
  usage: GenerationUsage,
): SessionUsage {
  return {
    turns: total.turns + 1,
    inputTokens: total.inputTokens + usage.inputTokens,
    outputTokens: total.outputTokens + usage.outputTokens,
    totalTokens: total.totalTokens + usage.totalTokens,
    reasoningTokens: total.reasoningTokens + usage.reasoningTokens,
    cachedInputTokens: total.cachedInputTokens + usage.cachedInputTokens,
    cacheWriteInputTokens:
      total.cacheWriteInputTokens + usage.cacheWriteInputTokens,
  }
}
