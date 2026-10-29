import type { MessagePart, MessageRowView } from '../messages'
import { cleanAgentText, toolView, type AgentQuestion } from './transcript'

export interface HerdrChatTool {
  name?: string
  summary?: string
  done?: boolean
  input?: unknown
  result?: unknown
  is_error?: boolean
}

export interface HerdrChatItem {
  id: string
  kind: string
  text?: string
  reasoning?: string
  tool?: HerdrChatTool
  [key: string]: unknown
}

export interface HerdrMessageRow extends MessageRowView {
  questions?: AgentQuestion[]
}

const assistantKinds = new Set(['assistant', 'agent', 'reasoning', 'tool'])

function textParts(item: HerdrChatItem): MessagePart[] {
  const parts: MessagePart[] = []
  const reasoning = cleanAgentText(
    typeof item.reasoning === 'string'
      ? item.reasoning
      : item.kind === 'reasoning'
        ? (item.text ?? '')
        : '',
  )
  if (reasoning)
    parts.push({ type: 'reasoning', text: reasoning, state: 'done' })

  if (item.kind !== 'reasoning') {
    const text = cleanAgentText(item.text ?? '')
    if (text) parts.push({ type: 'text', text })
  }
  return parts
}

function toolPart(tool: HerdrChatTool): MessagePart {
  const name = tool.name || 'tool'
  const view = toolView(tool)
  const input =
    name.toLowerCase() === 'exec' && view.detail
      ? { command: view.detail }
      : (tool.input ?? tool.summary)
  const errorText = tool.is_error
    ? typeof tool.result === 'string'
      ? tool.result
      : tool.result == null
        ? name
        : JSON.stringify(tool.result, null, 2)
    : undefined
  return {
    type: knownTool(name) ? `tool-${name}` : 'dynamic-tool',
    toolName: name,
    ...(tool.summary ? { summary: tool.summary } : {}),
    input,
    output: tool.result,
    ...(errorText ? { errorText } : {}),
    state: tool.is_error
      ? 'output-error'
      : tool.done === false
        ? 'input-available'
        : 'output-available',
  }
}

function knownTool(name: string) {
  return [
    'bash',
    'edit',
    'exec',
    'glob',
    'grep',
    'read',
    'task',
    'todowrite',
    'webfetch',
    'websearch',
    'write',
  ].includes(name.toLowerCase())
}

export function toMessageRows(
  items: readonly HerdrChatItem[],
): HerdrMessageRow[] {
  return items.map((item) => {
    const view = item.tool ? toolView(item.tool) : undefined
    return {
      id: item.id,
      message: {
        role:
          item.kind === 'user' || item.kind === 'human'
            ? 'user'
            : assistantKinds.has(item.kind) || item.tool
              ? 'assistant'
              : 'assistant',
        parts:
          item.tool && !view?.questions
            ? [toolPart(item.tool)]
            : textParts(item),
      },
      ...(view?.questions ? { questions: view.questions } : {}),
    }
  })
}
