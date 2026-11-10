import { describe, expect, it } from 'vitest'
import { decideDelivery, MIN_HOLD_MS, releaseOutcome } from './delivery'

describe('decideDelivery', () => {
  it('sends a real result into an empty composer', () => {
    expect(decideDelivery('send', ' 打开 Herdr ', '')).toEqual({
      kind: 'send',
      text: '打开 Herdr',
    })
    expect(decideDelivery('send', 'ok', '   ')).toEqual({
      kind: 'send',
      text: 'ok',
    })
  })

  it('puts a short result into the composer instead of sending it', () => {
    for (const text of ['好', ' a ', '', '。'])
      expect(decideDelivery('send', text, '')).toMatchObject({
        kind: 'insert',
        at: 'caret',
        heldBack: 'short',
      })
  })

  it('appends to existing text instead of sending', () => {
    expect(decideDelivery('send', '再加一句', '前面写好的')).toEqual({
      kind: 'insert',
      text: '再加一句',
      at: 'end',
      heldBack: 'draft',
    })
  })

  it('inserts at the caret when asked to edit', () => {
    expect(decideDelivery('insert', '你好', 'draft')).toEqual({
      kind: 'insert',
      text: '你好',
      at: 'caret',
    })
  })
})

describe('releaseOutcome', () => {
  it('cancels in the cancel capsule, however long the hold', () => {
    expect(releaseOutcome('cancel', 10, 'send')).toBe('cancel')
    expect(releaseOutcome('cancel', 60_000, 'send')).toBe('cancel')
  })

  it('drops a hold too short to be speech', () => {
    expect(releaseOutcome('release', MIN_HOLD_MS - 1, 'send')).toBe('too_short')
    expect(releaseOutcome('edit', MIN_HOLD_MS - 1, 'send')).toBe('too_short')
  })

  it('inserts from the edit capsule and follows the setting elsewhere', () => {
    expect(releaseOutcome('edit', MIN_HOLD_MS, 'send')).toBe('insert')
    expect(releaseOutcome('release', MIN_HOLD_MS, 'send')).toBe('send')
    expect(releaseOutcome('release', MIN_HOLD_MS, 'insert')).toBe('insert')
  })
})
