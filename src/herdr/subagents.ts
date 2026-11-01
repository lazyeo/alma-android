import { formatElapsed } from '../screens/threadStatus'
import type { HerdrChatItem } from './toMessageParts'

export interface HerdrSubagentDispatch {
  toolId: string
  title: string
  type?: string
  startedAt?: number
  running: boolean
  error: boolean
}

export interface SubagentStepRow {
  toolName: string
  summary: string
  state: 'running' | 'done' | 'error'
}

const nonEmptyString = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const timestamp = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export function listSubagents(
  items: readonly HerdrChatItem[],
): HerdrSubagentDispatch[] {
  return items.flatMap((item) => {
    const tool = item.tool as
      (NonNullable<HerdrChatItem['tool']> & { id?: unknown }) | undefined
    if (tool?.name !== 'Task') return []
    const input =
      tool.input && typeof tool.input === 'object'
        ? (tool.input as Record<string, unknown>)
        : {}
    const toolId = nonEmptyString(tool.id)
    if (!toolId) return []
    return [
      {
        toolId,
        title:
          nonEmptyString(input.description) ??
          nonEmptyString(tool.summary) ??
          'Subagent',
        type: nonEmptyString(input.subagent_type),
        startedAt: timestamp(item.time),
        running: tool.done !== true,
        error: tool.is_error === true,
      },
    ]
  })
}

export const runningCount = (subagents: readonly HerdrSubagentDispatch[]) =>
  subagents.reduce((count, subagent) => count + Number(subagent.running), 0)

export const formatSubagentElapsed = formatElapsed

export function subagentStepRows(
  items: readonly HerdrChatItem[],
): SubagentStepRow[] {
  return items.flatMap((item) => {
    const tool = item.tool
    if (!tool) return []
    return [
      {
        toolName: nonEmptyString(tool.name) ?? 'Tool',
        summary: nonEmptyString(tool.summary) ?? '',
        state: tool.is_error
          ? 'error'
          : tool.done === true
            ? 'done'
            : 'running',
      },
    ]
  })
}
