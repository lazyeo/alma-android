import { describe, expect, it } from 'vitest'
import { detectRefTrigger } from './refTrigger'

const kinds = [
  {
    kind: 'thread',
    label: 'Thread',
    prefixes: ['thread', '对话'],
    order: 1,
    scope: 'global',
    available: true,
  },
  {
    kind: 'skill',
    label: 'Skill',
    prefixes: ['skill', '技能'],
    order: 2,
    scope: 'global',
    available: true,
  },
]

describe('reference trigger detection', () => {
  it('does not trigger inside email addresses', () => {
    expect(detectRefTrigger('mail a@b', 8, kinds)).toBeUndefined()
  })
  it('normalizes a full-width at sign', () => {
    expect(detectRefTrigger('＠alma', 5, kinds)).toMatchObject({
      query: 'alma',
      start: 0,
    })
  })
  it('recognizes English and Chinese kind prefixes', () => {
    expect(detectRefTrigger('@thread:roadmap', 15, kinds)).toMatchObject({
      query: 'roadmap',
      kind: 'thread',
    })
    expect(detectRefTrigger('@技能：绘图', 6, kinds)).toMatchObject({
      query: '绘图',
      kind: 'skill',
    })
  })
  it('opens on a bare @ so recents can show before any query', () => {
    expect(detectRefTrigger('see @', 5, kinds)).toEqual({
      start: 4,
      end: 5,
      query: '',
    })
  })
  it('ignores materialized-token syntax', () => {
    expect(detectRefTrigger('@[thread', 8, kinds)).toBeUndefined()
  })
  it('allows one space in loose mobile queries but rejects double spaces', () => {
    expect(detectRefTrigger('@mobile release', 15, kinds)?.query).toBe(
      'mobile release',
    )
    expect(detectRefTrigger('@mobile  release', 16, kinds)).toBeUndefined()
  })
})
