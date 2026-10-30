export interface MessagePart {
  type: string
  text?: string
  toolCallId?: string
  state?: string
  input?: unknown
  output?: unknown
  [key: string]: unknown
}

export interface UploadedAttachment {
  kind: 'image' | 'file'
  name: string
  mediaType: string
  url?: string
  filePath?: string
  previewUrl?: string
}

export function buildMessageParts(
  text: string,
  attachments: UploadedAttachment[],
): MessagePart[] {
  const parts: MessagePart[] = []
  const trimmed = text.trim()
  if (trimmed) parts.push({ type: 'text', text: trimmed })

  for (const attachment of attachments) {
    if ('pending' in attachment) {
      throw new Error('Pending attachment must be uploaded before building message parts')
    }
    if (attachment.kind === 'image' && attachment.url) {
      parts.push({
        type: 'file',
        mediaType: attachment.mediaType,
        url: attachment.url,
        filename: attachment.name,
      })
    } else if (attachment.filePath) {
      // Desktop sends uploaded non-image files to the model as their local path.
      parts.push({ type: 'text', text: attachment.filePath })
    }
  }
  return parts
}

export function messageText(parts: MessagePart[]): string {
  return parts
    .filter((part) => part.type === 'text' && typeof part.text === 'string')
    .map((part) => part.text)
    .join('\n\n')
}

export function toolOutputText(part: MessagePart): string {
  if (typeof part.output === 'string') return part.output
  if (part.output != null) return JSON.stringify(part.output, null, 2) ?? ''
  if (typeof part.errorText === 'string') return part.errorText
  // Live stdout/stderr tail from `tool_output_streaming` while a tool runs.
  const stream = part.streamingOutput as
    { stdout?: string; stderr?: string } | undefined
  return [stream?.stdout, stream?.stderr].filter(Boolean).join('\n')
}

export interface TaskToolResult {
  result: string
  /** Sentence-case status label, e.g. `Failed`. */
  status: string
  failed: boolean
}

/**
 * Desktop's Task tool returns `{taskId, status, result}`; the sub-agent's
 * answer in `result` is markdown, so it reads as a reply rather than JSON.
 */
export function taskToolResult(
  name: string,
  part: MessagePart,
): TaskToolResult | undefined {
  const output = part.output as Record<string, unknown> | null | undefined
  if (
    name.toLowerCase() !== 'task' ||
    !output ||
    typeof output !== 'object' ||
    typeof output.status !== 'string' ||
    typeof output.result !== 'string'
  )
    return undefined
  const words = output.status.replaceAll('_', ' ').trim()
  return {
    result: output.result,
    status: words.charAt(0).toUpperCase() + words.slice(1),
    failed: output.status !== 'completed',
  }
}
