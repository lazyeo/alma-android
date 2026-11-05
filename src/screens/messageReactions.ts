import type { MessageRow } from '../relay'

// Mirrors the desktop's reaction store (0.4.434+): `message.metadata.reactions`
// is one entry per emoji, `{ emoji, reactedAt, by? }`, where `by: 'assistant'`
// marks Alma's own reaction (the 👀 she adds when she starts on a message)
// and an absent `by` is the user's. The desktop keeps at most 12 per message.

export type ReactionAuthor = 'user' | 'assistant'

export interface MessageReaction {
  emoji: string
  reactedAt: string
  by: ReactionAuthor
}

export type ReactionOp = 'add' | 'remove'

export const MAX_REACTIONS_PER_MESSAGE = 12

/** The sheet's quick row; any desktop-valid emoji still renders as a chip. */
export const QUICK_REACTIONS = ['👍', '❤️', '😂', '👀', '🎉', '🙏'] as const

/** Same test as the desktop's `isValidReactionEmoji`. */
export function isReactionEmoji(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const trimmed = value.trim()
  return (
    Boolean(trimmed) &&
    trimmed === value &&
    trimmed.length <= 32 &&
    !/\s/.test(trimmed) &&
    /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(trimmed)
  )
}

/** Reads `metadata.reactions` the way the desktop normalizes it. */
export function parseReactions(
  metadata: MessageRow['metadata'],
): MessageReaction[] {
  const raw = metadata?.reactions
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const reactions: MessageReaction[] = []
  for (const entry of raw) {
    const emoji = (entry as { emoji?: unknown } | null)?.emoji
    if (!isReactionEmoji(emoji) || seen.has(emoji)) continue
    seen.add(emoji)
    const { reactedAt, by } = entry as { reactedAt?: unknown; by?: unknown }
    reactions.push({
      emoji,
      reactedAt: typeof reactedAt === 'string' ? reactedAt : '',
      by: by === 'assistant' ? 'assistant' : 'user',
    })
  }
  return reactions
}

/** Rows the desktop has not stored yet (still sending, or failed) have no id to react to. */
export function canReact(row: MessageRow) {
  return !row.metadata?.optimisticStatus
}

export function isOwnReaction(reactions: MessageReaction[], emoji: string) {
  return reactions.some(
    (reaction) => reaction.emoji === emoji && reaction.by === 'user',
  )
}

/** Tapping an emoji removes the user's own reaction, otherwise adds it. */
export function toggleOp(
  reactions: MessageReaction[],
  emoji: string,
): ReactionOp {
  return isOwnReaction(reactions, emoji) ? 'remove' : 'add'
}

/**
 * The desktop's `applyReactionOp`, so the optimistic state matches what the
 * server will store: adding an emoji already present (even Alma's) is a no-op,
 * and `null` means the message is full (the server answers 409).
 */
export function applyReactionOp(
  reactions: MessageReaction[],
  emoji: string,
  op: ReactionOp,
  now = new Date().toISOString(),
): MessageReaction[] | null {
  const present = reactions.some((reaction) => reaction.emoji === emoji)
  if (op === 'remove')
    return present
      ? reactions.filter((reaction) => reaction.emoji !== emoji)
      : reactions
  if (present) return reactions
  if (reactions.length >= MAX_REACTIONS_PER_MESSAGE) return null
  return [...reactions, { emoji, reactedAt: now, by: 'user' }]
}

/** Writes reactions back in the desktop's wire shape (no `by` for the user). */
export function withReactions(
  row: MessageRow,
  reactions: MessageReaction[],
): MessageRow {
  return {
    ...row,
    metadata: {
      ...row.metadata,
      reactions: reactions.map(({ emoji, reactedAt, by }) =>
        by === 'assistant' ? { emoji, reactedAt, by } : { emoji, reactedAt },
      ),
    },
  }
}
