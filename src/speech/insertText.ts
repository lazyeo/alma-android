// Dictated text lands at the caret (replacing a selection) and never sends.

const WORDISH = /[A-Za-z0-9]/

export interface Insertion {
  value: string
  /** Caret position right after the inserted text. */
  caret: number
}

/**
 * Pads with one space only between Latin/digit runs, so "use" + "npm" does
 * not glue into "usenpm"; Chinese text and existing whitespace stay as is.
 */
export function insertDictation(
  value: string,
  selectionStart: number,
  selectionEnd: number,
  text: string,
): Insertion {
  const start = clamp(Math.min(selectionStart, selectionEnd), value.length)
  const end = clamp(Math.max(selectionStart, selectionEnd), value.length)
  const inserted = text.trim()
  if (!inserted) return { value, caret: end }
  const before = value.slice(0, start)
  const after = value.slice(end)
  const lead =
    WORDISH.test(before.slice(-1)) && WORDISH.test(inserted[0]) ? ' ' : ''
  const trail =
    WORDISH.test(inserted.slice(-1)) && WORDISH.test(after[0] ?? '') ? ' ' : ''
  const middle = lead + inserted + trail
  return {
    value: before + middle + after,
    caret: before.length + middle.length,
  }
}

function clamp(index: number, length: number) {
  return Number.isFinite(index) ? Math.max(0, Math.min(index, length)) : length
}
