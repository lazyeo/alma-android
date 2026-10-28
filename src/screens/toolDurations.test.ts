import { describe, expect, it } from 'vitest'
import {
  elapsedDuration,
  replyWorkedDuration,
  toolDuration,
  toolsWorkedDuration,
} from './toolDurations'

const tool = (overrides: Record<string, unknown> = {}) => ({
  type: 'tool-Bash',
  toolCallId: 'call-1',
  ...overrides,
})

describe('tool durations', () => {
  it('clamps elapsed time when the shared clock lags the start', () => {
    expect(elapsedDuration(9_000, 10_000)).toBe(0)
  })

  it('uses explicit duration metadata for completed tools', () => {
    expect(
      toolDuration(tool({ state: 'output-available', durationMs: 2450 })),
    ).toBe(2450)
  })

  it('uses the shared clock for a running tool start time', () => {
    expect(toolDuration(tool({ startedAt: 10_000 }), 12_400)).toBe(2400)
  })

  it('shows worked time only after the reply turn has finished', () => {
    const parts = [tool({ state: 'output-available', durationMs: 1_300 })]
    expect(replyWorkedDuration(parts, false)).toBe(1300)
    expect(replyWorkedDuration(parts, true)).toBeUndefined()
  })

  it('shows worked time only for tool-call replies lasting at least one second', () => {
    expect(
      toolsWorkedDuration([
        tool({ state: 'output-available', durationMs: 600 }),
        tool({ state: 'output-available', durationMs: 700 }),
      ]),
    ).toBe(1300)
    expect(
      toolsWorkedDuration([
        tool({ state: 'output-available', durationMs: 999 }),
      ]),
    ).toBeUndefined()
    expect(
      toolsWorkedDuration([{ type: 'text', text: 'hello' }]),
    ).toBeUndefined()
  })
})
