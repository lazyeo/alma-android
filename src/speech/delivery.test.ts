import { describe, expect, it } from 'vitest'
import {
  capsuleAction,
  decideDelivery,
  MIN_HOLD_MS,
  releaseOutcome,
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

describe('releaseOutcome', () => {
  it('cancels in the cancel capsule, however long the hold', () => {
    expect(releaseOutcome('cancel', 10, 'send')).toBe('cancel')
    expect(releaseOutcome('cancel', 60_000, 'send')).toBe('cancel')
  })

  it('drops a hold too short to be speech', () => {
    expect(releaseOutcome('release', MIN_HOLD_MS - 1, 'send')).toBe('too_short')
    expect(releaseOutcome('edit', MIN_HOLD_MS - 1, 'send')).toBe('too_short')
  })

  it('locks from the lock area, even right after the press', () => {
    expect(releaseOutcome('lock', 10, 'send')).toBe('lock')
    expect(releaseOutcome('lock', 60_000, 'insert')).toBe('lock')
  })

  it('does what the zone it ends in offers', () => {
    expect(releaseOutcome('edit', MIN_HOLD_MS, 'insert')).toBe('insert')
    expect(releaseOutcome('edit', MIN_HOLD_MS, 'send')).toBe('send')
    expect(releaseOutcome('release', MIN_HOLD_MS, 'send')).toBe('send')
    expect(releaseOutcome('release', MIN_HOLD_MS, 'insert')).toBe('insert')
  })
})

describe('capsuleAction', () => {
  it('offers the other way out than the release, never the same', () => {
    expect(capsuleAction('send', true)).toBe('insert')
    expect(capsuleAction('insert', true)).toBe('send')
  })

  it('only fills in where the composer cannot send', () => {
    expect(capsuleAction('insert', false)).toBe('insert')
    expect(capsuleAction('send', false)).toBe('insert')
  })
})
