import type { MessagePart } from '../relay'
import { t } from '../i18n/runtime'
export const isTool = (part: MessagePart) =>
  part.type.startsWith('tool-') || part.type === 'dynamic-tool'
export function groupParts(parts: MessagePart[]) {
  const groups: { tools: boolean; parts: MessagePart[]; indices: number[] }[] =
    []
  parts.forEach((part, index) => {
    if (part.type === 'step-start') return
    const tools = isTool(part),
      last = groups.at(-1)
    if (tools && last?.tools) {
      last.parts.push(part)
      last.indices.push(index)
    } else groups.push({ tools, parts: [part], indices: [index] })
  })
  return groups
}
export function reasoningLive(
  parts: MessagePart[],
  index: number,
  generating: boolean,
) {
  return (
    generating &&
    parts[index]?.type === 'reasoning' &&
    parts[index].state !== 'done' &&
    !parts
      .slice(index + 1)
      .some(
        (part) =>
          part.type === 'text' || isTool(part) || part.type === 'reasoning',
      )
  )
}
export function toolState(part: MessagePart) {
  return part.state === 'output-error' || part.errorText
    ? 'error'
    : part.state === 'output-available'
      ? 'done'
      : 'running'
}
export function thoughtLabel(metadataMs?: number, measuredMs?: number) {
  const ms = metadataMs ?? measuredMs
  return typeof ms === 'number' && Number.isFinite(ms) && ms >= 0
    ? t('message.reasoning.thoughtFor', { seconds: Math.round(ms / 1000) })
    : t('message.reasoning.thought')
}
export function reasoningDuration(part: MessagePart, rowSeconds?: unknown) {
  if (
    typeof part.reasoningDurationMs === 'number' &&
    Number.isFinite(part.reasoningDurationMs) &&
    part.reasoningDurationMs >= 0
  )
    return part.reasoningDurationMs
  return typeof rowSeconds === 'number' &&
    Number.isFinite(rowSeconds) &&
    rowSeconds >= 0
    ? rowSeconds * 1000
    : undefined
}
