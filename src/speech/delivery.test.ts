import { describe, expect, it } from 'vitest'
import {
  CANCEL_SLIDE_PX,
  decideDelivery,
  EDIT_SLIDE_PX,
  holdZone,
} from './delivery'

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

describe('holdZone', () => {
  it('maps the slide to release, cancel or edit', () => {
    expect(holdZone(0, 0)).toBe('release')
    expect(holdZone(-20, -CANCEL_SLIDE_PX + 1)).toBe('release')
    expect(holdZone(0, -CANCEL_SLIDE_PX)).toBe('cancel')
    expect(holdZone(-EDIT_SLIDE_PX, 0)).toBe('edit')
    expect(holdZone(-EDIT_SLIDE_PX - 40, -CANCEL_SLIDE_PX)).toBe('edit')
    expect(holdZone(-EDIT_SLIDE_PX, -CANCEL_SLIDE_PX - 40)).toBe('cancel')
    expect(holdZone(200, 200)).toBe('release')
  })
})
