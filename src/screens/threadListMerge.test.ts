import { describe, expect, it } from 'vitest'
import type { Thread } from '../relay'
import { changedThreadIds, mergeThreadList } from './threadListMerge'

const row = (id: string, extra: Partial<Thread> = {}) =>
  ({ id, title: id, updatedAt: '2026-11-08T00:00:00Z', ...extra }) as Thread
const ids = (rows: Thread[]) => rows.map((item) => item.id)

describe('mergeThreadList', () => {
  it('takes the answer when nothing changed here since the request', () => {
    const local = [row('a', { title: 'old' })]
    const fetched = [row('b'), row('a', { title: 'new' })]
    const merged = mergeThreadList(local, fetched, 100, new Map())
    expect(ids(merged)).toEqual(['b', 'a'])
    expect(merged[1].title).toBe('new')
  })

  it('keeps a row a live event changed after the request went out', () => {
    const live = row('a', { isGenerating: true })
    const merged = mergeThreadList(
      [live],
      [row('a', { isGenerating: false })],
      100,
      new Map([['a', 150]]),
    )
    expect(merged[0]).toBe(live)
  })

  it('takes the answer for a row changed before the request', () => {
    const merged = mergeThreadList(
      [row('a', { isGenerating: true })],
      [row('a', { isGenerating: false })],
      100,
      new Map([['a', 50]]),
    )
    expect(merged[0].isGenerating).toBe(false)
  })

  it('keeps a row whose updatedAt is newer than the fetched copy', () => {
    const fresh = row('a', { updatedAt: '2026-11-08T00:00:05Z', title: 'x' })
    const merged = mergeThreadList(
      [fresh],
      [row('a', { title: 'stale' })],
      100,
      new Map(),
    )
    expect(merged[0]).toBe(fresh)
  })

  it('does not bring back a row deleted here after the request', () => {
    const merged = mergeThreadList(
      [row('b')],
      [row('a'), row('b')],
      100,
      new Map([['a', 150]]),
    )
    expect(ids(merged)).toEqual(['b'])
  })

  it('keeps a newer local row the answer does not have yet', () => {
    const merged = mergeThreadList(
      [row('new'), row('a')],
      [row('a')],
      100,
      new Map([['new', 150]]),
    )
    expect(ids(merged)).toEqual(['new', 'a'])
  })

  it('drops a row the desktop no longer lists', () => {
    expect(
      ids(mergeThreadList([row('gone')], [row('a')], 100, new Map())),
    ).toEqual(['a'])
  })
})

describe('changedThreadIds', () => {
  it('names replaced, added and removed rows only', () => {
    const a = row('a'),
      b = row('b'),
      c = row('c')
    expect(changedThreadIds([a, b, c], [a, { ...b }, row('d')])).toEqual([
      'b',
      'd',
      'c',
    ])
  })
})
