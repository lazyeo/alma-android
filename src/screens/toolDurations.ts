import type { MessagePart } from '../relay'

const finiteTime = (value: unknown) =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : undefined

/** Shared elapsed-time guard for clocks that can tick just before a start. */
export const elapsedDuration = (now: number, startedAt: number) =>
  Math.max(0, now - startedAt)

export function toolDuration(part: MessagePart, now = Date.now()) {
  const explicit =
    finiteTime(part.durationMs) ??
    finiteTime(part.duration) ??
    finiteTime(part.elapsedMs)
  if (explicit !== undefined) return explicit

  const startedAt =
    finiteTime(part.startedAt) ??
    finiteTime(part.started_at) ??
    finiteTime(part.startTime)
  if (startedAt === undefined) return undefined
  const completedAt =
    finiteTime(part.completedAt) ??
    finiteTime(part.completed_at) ??
    finiteTime(part.endedAt)
  const end =
    completedAt ?? (part.state === 'output-available' ? undefined : now)
  return end === undefined ? undefined : elapsedDuration(end, startedAt)
}

export function replyWorkedDuration(
  parts: readonly MessagePart[],
  generating: boolean,
  now = Date.now(),
) {
  return generating ? undefined : toolsWorkedDuration(parts, now)
}

export function toolsWorkedDuration(
  parts: readonly MessagePart[],
  now = Date.now(),
) {
  const tools = parts.filter(
    (part) => part.type.startsWith('tool-') || part.type === 'dynamic-tool',
  )
  if (!tools.length) return undefined
  const total = tools.reduce(
    (sum, part) => sum + (toolDuration(part, now) ?? 0),
    0,
  )
  return total >= 1000 ? total : undefined
}
