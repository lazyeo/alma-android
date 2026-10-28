import { describe, expect, it } from 'vitest'
import { compactSummary } from './ContextUsageSheet'

describe('compactSummary', () => {
  it('writes a natural sentence for counts and savings', () => {
    expect(
      compactSummary({ success: true, compactedCount: 12, savedTokens: 30000 }),
    ).toBe('Summarized 12 messages and saved 30k tokens.')
    expect(compactSummary({ success: true, compactedCount: 12 })).toBe(
      'Summarized 12 messages.',
    )
    expect(compactSummary({ success: true })).toBe('Context summarized.')
  })

  it('uses a human fallback for failed compaction', () => {
    expect(compactSummary({ success: false })).toBe(
      'The desktop could not summarize this context.',
    )
  })
})
