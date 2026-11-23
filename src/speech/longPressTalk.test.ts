import { describe, expect, it } from 'vitest'
import { canLongPressToTalk } from './longPressTalk'

const box = (
  value: string,
  extra: Partial<{ disabled: boolean; readOnly: boolean }> = {},
) => ({
  value,
  disabled: false,
  readOnly: false,
  ...extra,
})

describe('canLongPressToTalk', () => {
  it('talks from an empty, unfocused text box', () => {
    expect(canLongPressToTalk(box(''), false)).toBe(true)
  })

  it('leaves select and paste to the system once there is text', () => {
    expect(canLongPressToTalk(box('draft'), false)).toBe(false)
    expect(canLongPressToTalk(box('  '), false)).toBe(false)
  })

  it('leaves paste to the system while the keyboard is up', () => {
    expect(canLongPressToTalk(box(''), true)).toBe(false)
  })

  it('never talks from a missing, disabled or read-only box', () => {
    expect(canLongPressToTalk(null, false)).toBe(false)
    expect(canLongPressToTalk(box('', { disabled: true }), false)).toBe(false)
    expect(canLongPressToTalk(box('', { readOnly: true }), false)).toBe(false)
  })
})
