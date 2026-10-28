import { describe, expect, it } from 'vitest'
import { desktopThreadPath } from '../desktopRoutes'
import {
  referenceEmptyCopy,
  referenceIconName,
  referenceNavigation,
  referenceSecondary,
  labelMissingFromRecent,
  splitMissingReferences,
} from './referenceBrowse'

describe('reference browse model', () => {
  it('maps known kinds to icons with a reference fallback', () => {
    expect(referenceIconName('thread')).toBe('message-circle')
    expect(referenceIconName('message')).toBe('message-square-text')
    expect(referenceIconName('crystal')).toBe('gem')
    expect(referenceIconName('unknown')).toBe('at-sign')
  })

  it('parses navigable thread, message, and crystal uris', () => {
    expect(referenceNavigation('desk', 'alma://thread/t1')).toEqual({
      path: desktopThreadPath('desk', 't1'),
    })
    expect(referenceNavigation('desk', 'alma://thread/t1/message/m1')).toEqual({
      path: desktopThreadPath('desk', 't1'),
      state: { fromSearch: true, searchRowId: 'm1' },
    })
    expect(referenceNavigation('desk', 'alma://crystal/c%202')?.path).toBe(
      '/d/desk/crystals/c%202',
    )
    expect(referenceNavigation('desk', 'alma://file/a')).toBeUndefined()
  })

  it('uses one secondary fact and desktop-specific empty copy', () => {
    expect(referenceSecondary({ subtitle: 'Source', summary: 'Summary' })).toBe(
      'Summary',
    )
    expect(referenceEmptyCopy('Alma@MBA')).toBe(
      'Nothing referenced on Alma@MBA yet',
    )
  })
})

describe('missing references', () => {
  it('keeps unresolvable rows out of the main list', () => {
    const rows = [
      { uri: 'a', exists: true },
      { uri: 'b', exists: false },
      { uri: 'c' },
    ]
    expect(splitMissingReferences(rows)).toEqual({
      present: [rows[0], rows[2]],
      missing: [rows[1]],
    })
  })
})

describe('missing reference labels', () => {
  it('names deleted targets by their recent label, not the bare id', () => {
    const cards = [
      { uri: 'alma://project/ws_3a', exists: false, title: 'ws_3a' },
      { uri: 'alma://thread/t1', exists: true, title: 'Live' },
    ]
    expect(
      labelMissingFromRecent(cards, [
        { uri: 'alma://project/ws_3a', label: 'Michels' },
        { uri: 'alma://thread/t1', label: 'Old name' },
      ]).map((card) => card.title),
    ).toEqual(['Michels', 'Live'])
  })
})
