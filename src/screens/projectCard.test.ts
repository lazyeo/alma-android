import { describe, expect, it } from 'vitest'
import { AlmaHttpError } from '../relay'
import {
  diffProjectCard,
  formatProjectCardRelativeTime,
  normalizeProjectCardResponse,
  projectCardIsHidden,
} from './projectCard'

describe('project card normalisation', () => {
  it('keeps valid fields and drops malformed resume links', () => {
    expect(
      normalizeProjectCardResponse({
        card: {
          brief: ' Brief ',
          focus: 42,
          resume: [
            { uri: 'alma://thread/one', label: ' Thread ' },
            { uri: 'https://example.com', label: 'Outside' },
            { uri: 'alma://thread/two' },
          ],
          proposal: {
            brief: 'Next brief',
            reason: 'Agent found a clearer direction',
            proposedAt: '2026-01-02T03:04:05.000Z',
            source: 'cli',
          },
        },
        config: { ignored: true },
      }),
    ).toEqual({
      brief: 'Brief',
      focus: '',
      resume: [{ uri: 'alma://thread/one', label: 'Thread' }],
      proposal: {
        brief: 'Next brief',
        reason: 'Agent found a clearer direction',
        proposedAt: '2026-01-02T03:04:05.000Z',
        source: 'cli',
      },
    })
  })

  it('returns null for a missing card', () => {
    expect(
      normalizeProjectCardResponse({ card: null, config: null }),
    ).toBeNull()
  })

  it('treats route and workspace 404s as hidden', () => {
    expect(projectCardIsHidden(new AlmaHttpError('missing', 404))).toBe(true)
    expect(projectCardIsHidden(new AlmaHttpError('broken', 500))).toBe(false)
  })
})

describe('project card proposal diff', () => {
  it('shows changed text and added or removed resume links', () => {
    expect(
      diffProjectCard(
        {
          brief: 'Old brief',
          focus: 'Same focus',
          resume: [
            { uri: 'alma://thread/keep', label: 'Keep' },
            { uri: 'alma://thread/remove', label: 'Remove' },
          ],
        },
        {
          brief: 'New brief',
          resume: [
            { uri: 'alma://thread/keep', label: 'Keep renamed' },
            { uri: 'alma://thread/add', label: 'Add' },
          ],
          reason: 'Changed',
          proposedAt: '2026-01-02T03:04:05.000Z',
        },
      ),
    ).toEqual({
      brief: { before: 'Old brief', after: 'New brief' },
      focus: undefined,
      resume: {
        added: [{ uri: 'alma://thread/add', label: 'Add' }],
        removed: [{ uri: 'alma://thread/remove', label: 'Remove' }],
      },
    })
  })
})

describe('project card relative time', () => {
  it('formats recent and future timestamps with the requested locale', () => {
    const now = Date.parse('2026-01-02T04:04:05.000Z')
    expect(
      formatProjectCardRelativeTime('2026-01-02T03:04:05.000Z', now, 'en'),
    ).toBe('1 hour ago')
    expect(
      formatProjectCardRelativeTime('2026-01-03T04:04:05.000Z', now, 'zh-CN'),
    ).toBe('明天')
  })

  it('returns an empty string for invalid timestamps', () => {
    expect(formatProjectCardRelativeTime('invalid', Date.now(), 'en')).toBe('')
  })
})
