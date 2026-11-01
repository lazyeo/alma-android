import { describe, expect, it } from 'vitest'
import { AlmaHttpError } from '../relay'
import {
  projectCardNeedsToggle,
  diffProjectCard,
  extractProjectCardError,
  formatProjectCardRelativeTime,
  normalizeProjectCardConsult,
  normalizeProjectCardResponse,
  projectCardHeaderSummary,
  projectCardIsHidden,
  projectCardStatus,
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

describe('project header model', () => {
  it('selects the brief, focus, and empty summary text independently', () => {
    expect(
      projectCardHeaderSummary(
        { brief: 'A concise brief', focus: 'Current focus' },
        'No project card yet',
      ),
    ).toEqual({ primary: 'A concise brief', secondary: 'Current focus' })
    expect(
      projectCardHeaderSummary(
        { brief: '', focus: 'Only focus' },
        'No project card yet',
      ),
    ).toEqual({ primary: 'Only focus' })
    expect(projectCardHeaderSummary(null, 'No project card yet')).toEqual({
      primary: 'No project card yet',
    })
  })

  it('derives the proposal status chip only when a proposal is pending', () => {
    expect(
      projectCardStatus({
        brief: '',
        focus: '',
        resume: [],
        proposal: {
          reason: 'Drafted',
          proposedAt: '2026-11-01T10:00:00.000Z',
        },
      }),
    ).toBe('proposal')
    expect(projectCardStatus(null)).toBeUndefined()
  })
})

describe('project card consultation normalisation', () => {
  it('keeps valid user and assistant messages and a valid summary', () => {
    expect(
      normalizeProjectCardConsult({
        transcript: {
          version: 1,
          messages: [
            {
              id: ' user-1 ',
              role: 'user',
              content: ' What should this project do? ',
              at: ' 2026-11-01T10:00:00.000Z ',
            },
            {
              id: 'assistant-1',
              role: 'assistant',
              content: 'Build a focused Android client.',
              at: '2026-11-01T10:00:01.000Z',
              model: ' openai:gpt-5 ',
            },
            { id: 'bad', role: 'tool', content: 'ignore', at: 'now' },
          ],
          summary: {
            text: ' Earlier direction ',
            throughId: 'assistant-0',
            count: 4,
            at: '2026-11-01T09:00:00.000Z',
          },
        },
      }),
    ).toEqual({
      version: 1,
      messages: [
        {
          id: 'user-1',
          role: 'user',
          content: 'What should this project do?',
          at: '2026-11-01T10:00:00.000Z',
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          content: 'Build a focused Android client.',
          at: '2026-11-01T10:00:01.000Z',
          model: 'openai:gpt-5',
        },
      ],
      summary: {
        text: 'Earlier direction',
        throughId: 'assistant-0',
        count: 4,
        at: '2026-11-01T09:00:00.000Z',
      },
    })
  })

  it('returns an empty transcript for malformed input', () => {
    expect(normalizeProjectCardConsult(null)).toEqual({
      version: 1,
      messages: [],
    })
  })
})

describe('project card errors', () => {
  it('extracts the server error payload from an HTTP failure', () => {
    expect(
      extractProjectCardError(
        new AlmaHttpError(
          'POST /project-card/draft failed (503): {"error":"No model available to draft — configure one"}',
          503,
        ),
        'Fallback',
      ),
    ).toBe('No model available to draft — configure one')
  })

  it('uses ordinary error messages and the fallback when needed', () => {
    expect(
      extractProjectCardError(new Error('Network offline'), 'Fallback'),
    ).toBe('Network offline')
    expect(extractProjectCardError({}, 'Fallback')).toBe('Fallback')
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

describe('project card expand toggle', () => {
  it('hides the toggle when the clamped text fits', () => {
    expect(projectCardNeedsToggle(false, 40, 40)).toBe(false)
    expect(projectCardNeedsToggle(false, 41, 40)).toBe(false)
  })
  it('shows the toggle when the clamped text overflows', () => {
    expect(projectCardNeedsToggle(false, 120, 60)).toBe(true)
  })
  it('keeps the toggle while expanded so it can collapse again', () => {
    expect(projectCardNeedsToggle(true, 40, 40)).toBe(true)
  })
})
