import type { HerdrChatItem } from './toMessageParts'

export function notificationMessage(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5)
  const joined = lines.join('\n')
  return joined.length > 200 ? `${joined.slice(0, 199).trimEnd()}…` : joined
}

export function lastAssistantText(response: unknown, firstLineOnly = false) {
  const page =
    response && typeof response === 'object' && 'page' in response
      ? (response.page as { items?: HerdrChatItem[] } | undefined)
      : undefined
  const items = page?.items ?? []
  let text = ''
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (!item) continue
    if (
      item.kind === 'user' ||
      item.kind === 'human' ||
      item.kind === 'teammate'
    )
      break
    if (item.kind === 'assistant' && typeof item.text === 'string') {
      text = item.text
      break
    }
  }
  return firstLineOnly
    ? (notificationMessage(text).split('\n')[0] ?? '')
    : notificationMessage(text)
}
