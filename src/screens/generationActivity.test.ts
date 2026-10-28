import { describe, expect, it } from 'vitest'
import type { MessagePart, MessageRow } from '../relay'
import {
  activityBarState,
  activityPhaseText,
  isScrolledAwayFromLatest,
} from './generationActivity'

const assistant = (parts: MessagePart[]): MessageRow => ({
  id: 'r1',
  threadId: 't',
  message: { id: 'm1', role: 'assistant', parts },
})
const user: MessageRow = {
  id: 'r0',
  threadId: 't',
  message: { id: 'm0', role: 'user', parts: [{ type: 'text', text: 'Go' }] },
}

describe('activity phase text', () => {
  it('prefers the pending phase message before any assistant content', () => {
    expect(
      activityPhaseText([user], {
        threadId: 't',
        sentAt: 0,
        phase: { kind: 'memory', message: 'Memories retrieved' },
      }),
    ).toBe('Memories retrieved')
    expect(activityPhaseText([user], { threadId: 't', sentAt: 0 })).toBe(
      'Thinking',
    )
  })

  it('names the running tool, live reasoning, or streaming text', () => {
    expect(
      activityPhaseText([
        user,
        assistant([
          { type: 'tool-Bash', toolCallId: 'c', state: 'input-available' },
        ]),
      ]),
    ).toBe('Running Bash')
    expect(
      activityPhaseText([
        user,
        assistant([{ type: 'reasoning', text: 'hm', state: 'streaming' }]),
      ]),
    ).toBe('Thinking')
    expect(
      activityPhaseText([user, assistant([{ type: 'text', text: 'Hi' }])]),
    ).toBe('Writing')
  })

  it('falls back to the desktop shimmer copy', () => {
    expect(activityPhaseText([user])).toBe('Following the thread')
    expect(
      activityPhaseText([
        user,
        assistant([
          {
            type: 'tool-Read',
            toolCallId: 'c',
            state: 'output-available',
          },
        ]),
      ]),
    ).toBe('Following the thread')
  })
})

describe('scroll position', () => {
  it('treats the last 80px as latest', () => {
    const at = (scrollTop: number) =>
      isScrolledAwayFromLatest({
        scrollTop,
        scrollHeight: 2000,
        clientHeight: 800,
      })
    expect(at(1200)).toBe(false)
    expect(at(1121)).toBe(false)
    expect(at(1119)).toBe(true)
    expect(at(0)).toBe(true)
  })
})

describe('activity bar state', () => {
  const base = {
    generating: true,
    rows: [user],
    pending: undefined,
    startedAt: 1_000,
    now: 66_000,
    documentVisible: true,
  }

  it('is hidden while idle or while the page is not visible', () => {
    expect(activityBarState({ ...base, generating: false }).visible).toBe(false)
    expect(activityBarState({ ...base, documentVisible: false }).visible).toBe(
      false,
    )
  })

  it('shows phase and elapsed while generating', () => {
    expect(activityBarState(base)).toEqual({
      visible: true,
      phase: 'Following the thread',
      elapsed: '1:05',
    })
  })

  it('does not own the standalone latest jump control', () => {
    expect(activityBarState(base)).toEqual({
      visible: true,
      phase: 'Following the thread',
      elapsed: '1:05',
    })
  })

  it('clamps elapsed when the shared clock is before the start', () => {
    expect(activityBarState({ ...base, startedAt: 2_000, now: 1_000 })).toEqual(
      {
        visible: true,
        phase: 'Following the thread',
        elapsed: '0s',
      },
    )
  })

  it('omits elapsed until a start time is known', () => {
    expect(activityBarState({ ...base, startedAt: undefined })).toMatchObject({
      visible: true,
      elapsed: undefined,
    })
  })
})
