import { describe, expect, it } from 'vitest'
import { selectionTextWithin } from './selection'

const node = (inside: boolean) => ({ inside }) as unknown as Node
const root = {
  contains: (n: Node) => (n as unknown as { inside: boolean }).inside,
} as unknown as Node
const selection = (anchorIn: boolean, focusIn: boolean, collapsed = false) => ({
  rangeCount: 1,
  isCollapsed: collapsed,
  anchorNode: node(anchorIn),
  focusNode: node(focusIn),
  toString: () => 'picked',
})

describe('selectionTextWithin', () => {
  it('returns text only for a selection wholly inside the reader', () => {
    expect(selectionTextWithin(selection(true, true), root)).toBe('picked')
    expect(selectionTextWithin(selection(true, false), root)).toBe('')
    expect(selectionTextWithin(selection(true, true, true), root)).toBe('')
    expect(selectionTextWithin(null, root)).toBe('')
  })
})
