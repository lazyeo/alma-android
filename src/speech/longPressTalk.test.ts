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
  it('talks from an empty text box', () => {
    expect(canLongPressToTalk(box(''))).toBe(true)
  })

  it('leaves select and paste to the system once there is text', () => {
    expect(canLongPressToTalk(box('draft'))).toBe(false)
    expect(canLongPressToTalk(box('  '))).toBe(false)
  })

  it('never talks from a missing, disabled or read-only box', () => {
    expect(canLongPressToTalk(null)).toBe(false)
    expect(canLongPressToTalk(box('', { disabled: true }))).toBe(false)
    expect(canLongPressToTalk(box('', { readOnly: true }))).toBe(false)
  })
})
