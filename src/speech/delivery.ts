// What happens to a finished dictation: sent through the composer's own
// send path, or put into the composer. Pure, so the guards are testable.

import type { HoldZone } from './holdLayout'

export type DictationAction = 'send' | 'insert'

/** Fewer characters than this (ignoring spaces) is too little to send. */
export const MIN_SEND_CHARS = 2

export type Delivery =
  | { kind: 'send'; text: string }
  | {
      kind: 'insert'
      text: string
      /** At the caret, or after what is already typed. */
      at: 'caret' | 'end'
      /** Set when a send was asked for but held back. */
      heldBack?: 'short' | 'draft'
    }

function visibleLength(text: string): number {
  return [...text.replace(/\s+/g, '')].length
}

/**
 * A send is held back when the result is nearly empty (a cough, a stray
 * word) or when the composer already has text, which the dictation joins
 * instead of being sent without it.
 */
export function decideDelivery(
  action: DictationAction,
  text: string,
  draft: string,
): Delivery {
  const spoken = text.trim()
  if (action === 'insert') return { kind: 'insert', text: spoken, at: 'caret' }
  if (visibleLength(spoken) < MIN_SEND_CHARS)
    return { kind: 'insert', text: spoken, at: 'caret', heldBack: 'short' }
  if (draft.trim())
    return { kind: 'insert', text: spoken, at: 'end', heldBack: 'draft' }
  return { kind: 'send', text: spoken }
}

/** A hold shorter than this was a tap or a slip, not speech. */
export const MIN_HOLD_MS = 1000

export type ReleaseOutcome = DictationAction | 'cancel' | 'too_short'

/**
 * What letting go of a hold does: the cancel capsule abandons it, a hold
 * too short to be speech is dropped, the edit capsule always inserts, and
 * anywhere else follows the composer's "after release" setting.
 */
export function releaseOutcome(
  zone: HoldZone,
  heldMs: number,
  release: DictationAction,
): ReleaseOutcome {
  if (zone === 'cancel') return 'cancel'
  if (heldMs < MIN_HOLD_MS) return 'too_short'
  return zone === 'edit' ? 'insert' : release
}
