// What happens to a finished dictation: sent through the composer's own
// send path, or put into the composer. Pure, so the guards are testable.

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

export type HoldZone = 'release' | 'cancel' | 'edit'

/** Slide this far up to cancel, or this far left to edit instead. */
export const CANCEL_SLIDE_PX = 80
export const EDIT_SLIDE_PX = 80

/** Where a held finger is, from its movement since the press. */
export function holdZone(dx: number, dy: number): HoldZone {
  const up = -dy
  const left = -dx
  if (up >= CANCEL_SLIDE_PX && up >= left) return 'cancel'
  if (left >= EDIT_SLIDE_PX) return 'edit'
  return 'release'
}
