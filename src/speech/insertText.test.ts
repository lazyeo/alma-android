import { describe, expect, it } from 'vitest'
import { insertDictation } from './insertText'

describe('insertDictation', () => {
  it('inserts at the caret', () => {
    expect(insertDictation('你好世界', 2, 2, '，')).toEqual({
      value: '你好，世界',
      caret: 3,
    })
  })

  it('replaces the selection', () => {
    expect(insertDictation('run old now', 4, 7, 'new')).toEqual({
      value: 'run new now',
      caret: 7,
    })
  })

  it('pads only between Latin words', () => {
    expect(insertDictation('use', 3, 3, 'npm')).toEqual({
      value: 'use npm',
      caret: 7,
    })
    expect(insertDictation('runtest', 3, 3, 'npm')).toEqual({
      value: 'run npm test',
      caret: 8,
    })
    expect(insertDictation('打开', 2, 2, 'Herdr')).toEqual({
      value: '打开Herdr',
      caret: 7,
    })
    expect(insertDictation('use ', 4, 4, 'npm')).toEqual({
      value: 'use npm',
      caret: 7,
    })
  })

  it('trims the dictated text and ignores empty results', () => {
    expect(insertDictation('', 0, 0, '  hi \n')).toEqual({
      value: 'hi',
      caret: 2,
    })
    expect(insertDictation('keep', 2, 2, '  ')).toEqual({
      value: 'keep',
      caret: 2,
    })
  })

  it('clamps out-of-range selections and handles reversed ones', () => {
    expect(insertDictation('ab', 9, 9, '。')).toEqual({
      value: 'ab。',
      caret: 3,
    })
    expect(insertDictation('你好吗呢', 3, 1, '是')).toEqual({
      value: '你是呢',
      caret: 2,
    })
  })
})
