import type { HerdrChatItem } from './toMessageParts'
import { toolView } from './transcript'

export function notificationMessage(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5)
  const joined = lines.join('\n')
  return joined.length > 200 ? `${joined.slice(0, 199).trimEnd()}…` : joined
}

/** Items of a `getHerdrChat` page response; empty for anything else. */
export function chatPageItems(response: unknown): HerdrChatItem[] {
  const page =
    response && typeof response === 'object' && 'page' in response
      ? (response.page as { items?: unknown } | undefined)
      : undefined
  return Array.isArray(page?.items) ? (page.items as HerdrChatItem[]) : []
}

const isPersonItem = (item: HerdrChatItem) =>
  item.kind === 'user' || item.kind === 'human' || item.kind === 'teammate'

/** The newest unfinished tool call of the current turn. */
function pendingTool(items: readonly HerdrChatItem[]) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (!item) continue
    if (isPersonItem(item)) return undefined
    if (item.kind === 'tool' && item.tool && item.tool.done !== true)
      return item
  }
  return undefined
}

/**
 * Word-for-word question of a pending AskUserQuestion-style tool call, taken
 * from the transcript rather than the terminal. With several questions, the
 * one whose options are on screen wins; without a match it stays ambiguous.
 */
export function pendingAgentQuestion(
  items: readonly HerdrChatItem[],
  screenOptions?: readonly string[],
) {
  const tool = pendingTool(items)?.tool
  if (!tool) return ''
  const questions = (toolView(tool).questions ?? []).filter((entry) =>
    entry.question.trim(),
  )
  if (!questions.length) return ''
  const onScreen = (screenOptions ?? []).map((label) => label.trim())
  if (onScreen.length && questions.length > 1) {
    const shown = questions.find(
      (entry) =>
        entry.options.length > 0 &&
        entry.options.every((option) =>
          onScreen.some((label) => label.startsWith(option.label.trim())),
        ),
    )
    return shown?.question.trim() ?? ''
  }
  return questions[0].question.trim()
}

/**
 * Transcript identity of the turn behind an agent status, so a status that
 * flickers away and back does not alert twice for the same prompt or reply.
 * Undefined when the transcript cannot tell turns apart.
 */
export function agentTurnIdentity(
  items: readonly HerdrChatItem[],
  status: string | undefined,
) {
  if (status === 'blocked') return pendingTool(items)?.id || undefined
  if (status === 'done') return items[items.length - 1]?.id || undefined
  return undefined
}

export function lastAssistantText(response: unknown, firstLineOnly = false) {
  const items = chatPageItems(response)
  let text = ''
  for (let index = items.length - 1; index >= 0; index -= 1) {
    const item = items[index]
    if (!item) continue
    if (isPersonItem(item)) break
    if (item.kind === 'assistant' && typeof item.text === 'string') {
      text = item.text
      break
    }
  }
  return firstLineOnly
    ? (notificationMessage(text).split('\n')[0] ?? '')
    : notificationMessage(text)
}
