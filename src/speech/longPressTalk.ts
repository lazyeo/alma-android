// When a long press on the composer's text box starts hold-to-talk instead
// of the system's own long press (select, paste). Pure, so the rule is
// testable on its own.

/** What the rule reads from the text box. */
export interface TalkTarget {
  value: string
  disabled: boolean
  readOnly: boolean
}

/**
 * Only an empty text box the keyboard is not on: with text in it, a long
 * press selects; once focused, it pastes. Whitespace counts as text, so the
 * rule never takes a box away from someone mid-edit.
 */
export function canLongPressToTalk(
  area: TalkTarget | null | undefined,
  focused: boolean,
): boolean {
  if (!area || focused || area.disabled || area.readOnly) return false
  return area.value === ''
}
