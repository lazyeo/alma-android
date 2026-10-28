import { describe, expect, it } from 'vitest'
import {
  formatLoopInterval,
  loopStatus,
  parseLoop,
  parseLoopPrompt,
} from './threadLoop'

describe('loop parsing', () => {
  it('parses the desktop loop shape and rejects malformed values', () => {
    const loop = parseLoop({
      prompt: 'check CI',
      intervalMs: 300_000,
      startedAt: 10,
      iterations: 2,
      lastFiredAt: 20,
    })
    expect(loop).toEqual({
      prompt: 'check CI',
      intervalMs: 300_000,
      startedAt: 10,
      iterations: 2,
      lastFiredAt: 20,
    })
    expect(
      parseLoop({ ...loop, stoppedAt: 30, stoppedReason: 'stopped by user' }),
    ).toMatchObject({ stoppedAt: 30, stoppedReason: 'stopped by user' })
    expect(parseLoop(null)).toBeNull()
    expect(parseLoop({ prompt: 3, intervalMs: 1 })).toBeNull()
    expect(parseLoop({ prompt: 'x', intervalMs: 'soon' })).toBeNull()
  })

  it('reports running and stopped status', () => {
    const loop = parseLoop({
      prompt: 'x',
      intervalMs: 60_000,
      startedAt: 0,
      iterations: 0,
    })!
    expect(loopStatus(null)).toBe('none')
    expect(loopStatus(loop)).toBe('running')
    expect(loopStatus({ ...loop, stoppedAt: 1 })).toBe('stopped')
  })
})

describe('loop interval syntax', () => {
  it('reads a leading interval like the desktop', () => {
    expect(parseLoopPrompt('5m check the build')).toEqual({
      intervalMs: 300_000,
      prompt: 'check the build',
    })
    expect(parseLoopPrompt('2h summarize')).toEqual({
      intervalMs: 7_200_000,
      prompt: 'summarize',
    })
  })

  it('reads a trailing "every" clause', () => {
    expect(parseLoopPrompt('check CI every 10 minutes')).toEqual({
      intervalMs: 600_000,
      prompt: 'check CI',
    })
    expect(parseLoopPrompt('ping every hour')).toEqual({
      intervalMs: 3_600_000,
      prompt: 'ping',
    })
  })

  it('leaves the interval to the desktop default when absent', () => {
    expect(parseLoopPrompt('  just a prompt ')).toEqual({
      intervalMs: null,
      prompt: 'just a prompt',
    })
  })

  it('formats intervals as the desktop does', () => {
    expect(formatLoopInterval(60_000)).toBe('1m')
    expect(formatLoopInterval(5_400_000)).toBe('90m')
    expect(formatLoopInterval(7_200_000)).toBe('2h')
    expect(formatLoopInterval(86_400_000)).toBe('1d')
  })
})
