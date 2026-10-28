import { describe, expect, it } from 'vitest'
import {
  accumulateSessionUsage,
  applyContextUsageEvent,
  contextLevel,
  emptySessionUsage,
  formatTokens,
  pieSectorPath,
  usageFromCompletion,
} from './contextUsage'

describe('context usage thresholds', () => {
  it('maps percent to ok, warn, and danger levels', () => {
    expect(contextLevel(0)).toBe('ok')
    expect(contextLevel(69.9)).toBe('ok')
    expect(contextLevel(70)).toBe('warn')
    expect(contextLevel(89.9)).toBe('warn')
    expect(contextLevel(90)).toBe('danger')
    expect(contextLevel(140)).toBe('danger')
  })

  it('builds a clamped filled pie sector', () => {
    expect(pieSectorPath(0)).toBe('')
    expect(pieSectorPath(25)).toBe('M 10 10 L 10 1 A 9 9 0 0 1 19 10 Z')
    expect(pieSectorPath(100)).toContain('A 9 9 0 1 1')
    expect(pieSectorPath(150)).toBe(pieSectorPath(100))
    expect(pieSectorPath(Number.NaN)).toBe('')
  })

  it('formats token counts compactly', () => {
    expect(formatTokens(950)).toBe('950')
    expect(formatTokens(12_345)).toBe('12.3k')
    expect(formatTokens(200_000)).toBe('200k')
    expect(formatTokens(1_250_000)).toBe('1.25M')
  })
})

describe('realtime context usage', () => {
  const current = {
    threadId: 't',
    usagePercent: 10,
    totalTokens: 100,
    contextWindow: 1000,
  }

  it('applies a context_usage_update for this thread', () => {
    expect(
      applyContextUsageEvent(current, 't', {
        type: 'context_usage_update',
        data: {
          threadId: 't',
          usagePercent: 42.5,
          totalTokens: 425,
          contextWindow: 1000,
        },
      }),
    ).toEqual({
      threadId: 't',
      usagePercent: 42.5,
      totalTokens: 425,
      contextWindow: 1000,
    })
  })

  it('ignores other threads, other events, and malformed payloads', () => {
    expect(
      applyContextUsageEvent(current, 't', {
        type: 'context_usage_update',
        data: { threadId: 'x', usagePercent: 1, totalTokens: 1 },
      }),
    ).toBe(current)
    expect(
      applyContextUsageEvent(current, 't', { type: 'message_delta', data: {} }),
    ).toBe(current)
    expect(
      applyContextUsageEvent(current, 't', {
        type: 'context_usage_update',
        data: { threadId: 't', usagePercent: 'high' },
      }),
    ).toBe(current)
  })
})

describe('generation usage', () => {
  const completed = {
    type: 'generation_completed',
    data: {
      threadId: 't',
      assistantMessageId: 'a1',
      model: 'gpt',
      usage: {
        inputTokens: 1000,
        outputTokens: 200,
        totalTokens: 1200,
        reasoningTokens: 50,
        cachedInputTokens: 800,
        cacheWriteInputTokens: 10,
      },
    },
  }

  it('reads the exact desktop usage fields from generation_completed', () => {
    expect(usageFromCompletion('t', completed)).toEqual({
      assistantMessageId: 'a1',
      usage: {
        inputTokens: 1000,
        outputTokens: 200,
        totalTokens: 1200,
        reasoningTokens: 50,
        cachedInputTokens: 800,
        cacheWriteInputTokens: 10,
      },
    })
  })

  it('ignores other threads and completions without usage', () => {
    expect(
      usageFromCompletion('x', completed as typeof completed),
    ).toBeUndefined()
    expect(
      usageFromCompletion('t', {
        type: 'generation_completed',
        data: { threadId: 't' },
      }),
    ).toBeUndefined()
  })

  it('treats missing optional fields as zero', () => {
    expect(
      usageFromCompletion('t', {
        type: 'generation_completed',
        data: { threadId: 't', usage: { inputTokens: 5, outputTokens: 2 } },
      })?.usage,
    ).toEqual({
      inputTokens: 5,
      outputTokens: 2,
      totalTokens: 7,
      reasoningTokens: 0,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 0,
    })
  })

  it('accumulates session totals per completed turn', () => {
    const usage = usageFromCompletion('t', completed)!.usage
    const once = accumulateSessionUsage(emptySessionUsage, usage)
    const twice = accumulateSessionUsage(once, usage)
    expect(twice).toEqual({
      turns: 2,
      inputTokens: 2000,
      outputTokens: 400,
      totalTokens: 2400,
      reasoningTokens: 100,
      cachedInputTokens: 1600,
      cacheWriteInputTokens: 20,
    })
    expect(emptySessionUsage.turns).toBe(0)
  })
})
