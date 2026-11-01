import { describe, expect, it } from 'vitest'
import { lastAssistantText } from './lastAssistantText'

describe('lastAssistantText', () => {
  it.each(['user', 'human', 'teammate'])(
    'stops before an older assistant when the newest boundary is %s',
    (kind) => {
      expect(
        lastAssistantText({
          page: {
            items: [
              { id: 'assistant', kind: 'assistant', text: 'Older reply' },
              { id: 'boundary', kind, text: 'Newer message' },
            ],
          },
        }),
      ).toBe('')
    },
  )

  it('keeps the newest assistant text and first-line option', () => {
    const response = {
      page: {
        items: [
          { id: 'user', kind: 'user', text: 'Question' },
          {
            id: 'assistant',
            kind: 'assistant',
            text: 'First line\nSecond line',
          },
          { id: 'tool', kind: 'tool', text: 'Tool output' },
        ],
      },
    }

    expect(lastAssistantText(response)).toBe('First line\nSecond line')
    expect(lastAssistantText(response, true)).toBe('First line')
  })
})
