import { describe, expect, it } from 'vitest'
import type { RefCard, RefKind, RefRecentItem, Thread } from '../relay'
import {
  defaultRefKinds,
  filterRecentRefItems,
  recentThreadRefItems,
} from './refPickerResults'

const recent = (
  uri: string,
  kind: string,
  label: string,
  lastAt = 1,
): RefRecentItem => ({ uri, kind, label, count: 1, lastAt })

const card = (
  uri: string,
  kind: string,
  title: string,
  exists = true,
): RefCard => ({ uri, kind, id: uri, exists, title })

describe('recent reference filtering', () => {
  it('drops unresolved refs and dedupes by uri and kind plus label', () => {
    const items = [
      recent('alma://file/ws_3a/docs/1955.pdf', 'file', '1955.pdf', 9),
      recent('alma://prompt/one', 'prompt', '核查规则', 8),
      recent('alma://prompt/two', 'prompt', '核查规则', 7),
      recent('alma://thread/a', 'thread', 'Alpha', 6),
      recent('alma://thread/a', 'thread', 'Alpha duplicate', 5),
    ]
    const resolved = [
      card(items[0].uri, 'file', '1955.pdf', false),
      card(items[1].uri, 'prompt', '核查规则'),
      card(items[2].uri, 'prompt', '核查规则'),
      card(items[3].uri, 'thread', 'Alpha'),
    ]

    expect(filterRecentRefItems(items, resolved)).toEqual([
      { uri: 'alma://prompt/one', kind: 'prompt', title: '核查规则' },
      { uri: 'alma://thread/a', kind: 'thread', title: 'Alpha' },
    ])
  })
})

describe('default reference kinds', () => {
  it('hides advanced kinds from chips while keeping other available kinds', () => {
    const kinds = ['thread', 'task', 'host', 'provider', 'module', 'file'].map(
      (kind, order): RefKind => ({
        kind,
        label: kind,
        prefixes: [`@${kind}:`],
        order,
        scope: 'global',
        available: true,
      }),
    )
    expect(defaultRefKinds(kinds).map((item) => item.kind)).toEqual([
      'thread',
      'file',
    ])
  })
})

describe('empty recent fallback', () => {
  it('puts the five most recently updated threads first', () => {
    const threads = Array.from({ length: 7 }, (_, index): Thread => ({
      id: `t-${index}`,
      title: `Thread ${index}`,
      updatedAt: index,
    }))
    expect(recentThreadRefItems(threads).map((item) => item.uri)).toEqual([
      'alma://thread/t-6',
      'alma://thread/t-5',
      'alma://thread/t-4',
      'alma://thread/t-3',
      'alma://thread/t-2',
    ])
  })
})
