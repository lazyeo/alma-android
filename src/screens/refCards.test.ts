import { describe, expect, it } from 'vitest'
import { parseBacklinks, refDestination } from './refCards'

describe('reference navigation', () => {
  it('opens thread and crystal references inside the current desktop', () => {
    expect(refDestination('home', { uri: 'alma://thread/t%201' })).toBe(
      '/d/home/threads/t%201',
    )
    expect(refDestination('home', { uri: 'alma://crystal/cry_1' })).toBe(
      '/d/home/crystals/cry_1',
    )
  })
  it('prefers the resolved nav thread and ignores unknown kinds', () => {
    expect(
      refDestination('home', {
        uri: 'alma://message/m1',
        nav: { route: 'thread', threadId: 't2' },
      }),
    ).toBe('/d/home/threads/t2')
    expect(refDestination('home', { uri: 'alma://skill/draw' })).toBeUndefined()
  })
})

describe('backlinks parsing', () => {
  it('accepts desktop row variants and drops rows without a thread', () => {
    expect(
      parseBacklinks({
        backlinks: [
          {
            threadId: 't1',
            threadTitle: 'Roadmap',
            snippet: 'see @x',
            createdAt: 5,
          },
          { thread_id: 't2', title: 'Plan' },
          { snippet: 'orphan' },
        ],
      }),
    ).toEqual([
      { threadId: 't1', title: 'Roadmap', snippet: 'see @x', at: 5 },
      { threadId: 't2', title: 'Plan' },
    ])
    expect(parseBacklinks({ items: 'bad' })).toEqual([])
  })
})
