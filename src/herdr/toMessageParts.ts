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

export interface HerdrChatImage {
  url?: string
  media_type?: string
  mediaType?: string
  filename?: string
  name?: string
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

function imageParts(value: unknown): MessagePart[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object') return []
    const image = candidate as HerdrChatImage
    if (typeof image.url !== 'string') return []
    const mediaType = image.media_type ?? image.mediaType ?? 'image/png'
    const filename =
      image.filename ??
      image.name ??
      decodeURIComponent(image.url.split('/').pop() || 'image')
    return [
      {
        type: 'file',
        mediaType,
        url: image.url,
        filename,
      },
    ]
  })
}

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
  parts.push(...imageParts(item.images))
  return parts
}

function toolParts(tool: HerdrChatTool): MessagePart[] {
  const name = tool.name || 'tool'
  const view = toolView(tool)
  const input =
    name.toLowerCase() === 'exec' && view.detail
      ? { command: view.detail }
      : (tool.input ?? tool.summary)
  const result =
    tool.result &&
    typeof tool.result === 'object' &&
    !Array.isArray(tool.result)
      ? (tool.result as Record<string, unknown>)
      : undefined
  const output = result && 'text' in result ? result.text : tool.result
  const errorText = tool.is_error
    ? typeof output === 'string'
      ? output
      : output == null
        ? name
        : JSON.stringify(output, null, 2)
    : undefined
  return [
    {
      type: knownTool(name) ? `tool-${name}` : 'dynamic-tool',
      toolName: name,
      ...(tool.summary ? { summary: tool.summary } : {}),
      input,
      output,
      ...(errorText ? { errorText } : {}),
      state: tool.is_error
        ? 'output-error'
        : tool.done === false
          ? 'input-available'
          : 'output-available',
    },
    ...imageParts(result?.images),
    ...imageParts(
      (tool as HerdrChatTool & { result_images?: unknown }).result_images,
    ),
  ]
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

export function toItemRows(items: readonly HerdrChatItem[]): HerdrMessageRow[] {
  return items.map((item) => {
    const view = item.tool ? toolView(item.tool) : undefined
    return {
      id: item.id,
      message: {
        role:
          item.kind === 'user' || item.kind === 'human' ? 'user' : 'assistant',
        parts:
          item.tool && !view?.questions
            ? [...toolParts(item.tool), ...imageParts(item.images)]
            : textParts(item),
      },
      ...(view?.questions ? { questions: view.questions } : {}),
    }
  })
}

// One assistant turn = one message, like a thread reply: consecutive
// assistant rows (text, reasoning, tools) merge. A row carrying questions
// ends its turn so the options stay directly under the question.
export function groupTurns(
  rows: readonly HerdrMessageRow[],
): HerdrMessageRow[] {
  const grouped: HerdrMessageRow[] = []
  for (const row of rows) {
    const previous = grouped.at(-1)
    if (
      row.message.role === 'assistant' &&
      previous?.message.role === 'assistant' &&
      !previous.questions
    ) {
      grouped[grouped.length - 1] = {
        ...previous,
        message: {
          ...previous.message,
          parts: [
            ...(previous.message.parts ?? []),
            ...(row.message.parts ?? []),
          ],
        },
        ...(row.questions ? { questions: row.questions } : {}),
      }
      continue
    }
    grouped.push(row)
  }
  return grouped
}

export function toMessageRows(
  items: readonly HerdrChatItem[],
): HerdrMessageRow[] {
  return groupTurns(toItemRows(items))
}
