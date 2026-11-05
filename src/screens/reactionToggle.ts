import { AlmaHttpError, isUnsupportedEndpoint } from '../relay/almaApi'
import type { MessageRow } from '../relay'
import {
  applyReactionOp,
  toggleOp,
  type MessageReaction,
  type ReactionOp,
} from './messageReactions'

/**
 * Desktops before 0.4.434 have no reactions route, so Express answers 404
 * with its own page. The route itself answers 404 with a JSON
 * `Message not found` for a missing message, which is not "unsupported".
 */
export function isReactionsRouteMissing(error: unknown) {
  return (
    isUnsupportedEndpoint(error) &&
    !(error as AlmaHttpError).message.includes('Message not found')
  )
}

export type ReactionToggleOutcome =
  'applied' | 'unchanged' | 'full' | 'conflict' | 'unsupported' | 'failed'

export interface ReactionToggleDeps {
  /** Shows these reactions on the message now (optimistic or rollback). */
  show: (reactions: MessageReaction[]) => void
  send: (emoji: string, op: ReactionOp) => Promise<MessageRow>
  /** The desktop's updated row, also broadcast as `message_updated`. */
  confirm: (row: MessageRow) => void
}

/**
 * Optimistically toggles the user's reaction and reconciles with the desktop.
 * Every non-success outcome restores `current`; the caller decides what each
 * outcome tells the user (a 409 and a full message stay quiet).
 */
export async function toggleReaction(
  current: MessageReaction[],
  emoji: string,
  deps: ReactionToggleDeps,
): Promise<{ outcome: ReactionToggleOutcome; error?: unknown }> {
  const op = toggleOp(current, emoji)
  const next = applyReactionOp(current, emoji, op)
  if (!next) return { outcome: 'full' }
  if (next === current) return { outcome: 'unchanged' }
  deps.show(next)
  try {
    deps.confirm(await deps.send(emoji, op))
    return { outcome: 'applied' }
  } catch (error) {
    deps.show(current)
    if (error instanceof AlmaHttpError && error.status === 409)
      return { outcome: 'conflict', error }
    if (isReactionsRouteMissing(error)) return { outcome: 'unsupported', error }
    return { outcome: 'failed', error }
  }
}
