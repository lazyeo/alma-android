import { describe, expect, it } from 'vitest'
import type { MessageRow } from '../relay'
import {
  formatElapsed,
  generationStartedAt,
  primaryThreadMark,
  threadRowStatuses,
} from './threadStatus'

describe('thread list statuses', () => {
  it('renders the queued Clock from a remote extension summary keyed by desktop and thread', () => {
    const fixture = [
      {
        desktopId: 'fixture-desktop',
        threadId: 't-queue',
        count: 3,
      },
    ]
    const queuedCount =
      fixture.find(
        (summary) =>
          summary.desktopId === 'fixture-desktop' &&
          summary.threadId === 't-queue',
      )?.count ?? 0

    expect(
      threadRowStatuses({
        generating: false,
        namingTitle: false,
        queuedCount,
        hasDraft: false,
      }),
    ).toContainEqual({ kind: 'queued', label: '3 queued' })
  })

  it('orders generating, naming, queued, then draft', () => {
    expect(
      threadRowStatuses({
        generating: true,
        namingTitle: true,
        queuedCount: 2,
        hasDraft: true,
      }),
    ).toEqual([
      { kind: 'generating', label: 'Generating' },
      { kind: 'naming', label: 'Naming' },
      { kind: 'queued', label: '2 queued' },
      { kind: 'draft', label: 'Draft' },
    ])
  })

  it('keeps a pending done update in the to-do priority slot', () => {
    expect(
      primaryThreadMark({
        generating: false,
        needsResponse: false,
        gtdStatus: 'done',
        pendingTodoDone: true,
        unread: true,
      }),
    ).toBe('todo')
  })

  it('maps only active GTD statuses into the primary status slot', () => {
    const mark = (
      gtdStatus: Parameters<typeof primaryThreadMark>[0]['gtdStatus'],
    ) =>
      primaryThreadMark({
        generating: false,
        needsResponse: false,
        gtdStatus,
        unread: false,
      })

    expect(mark('todo')).toBe('todo')
    expect(mark('in_progress')).toBe('in_progress')
    expect(mark('inbox')).toBeUndefined()
    expect(mark('done')).toBeUndefined()
    expect(mark('archived')).toBeUndefined()
  })

  it('prioritizes generating, response, active GTD status, then unread in the status slot', () => {
    expect(
      primaryThreadMark({
        generating: true,
        needsResponse: true,
        gtdStatus: 'todo',
        unread: true,
      }),
    ).toBe('generating')
    expect(
      primaryThreadMark({
        generating: false,
        needsResponse: true,
        gtdStatus: 'todo',
        unread: true,
      }),
    ).toBe('response')
    expect(
      primaryThreadMark({
        generating: false,
        needsResponse: false,
        gtdStatus: 'todo',
        unread: true,
      }),
    ).toBe('todo')
    expect(
      primaryThreadMark({
        generating: false,
        needsResponse: false,
        gtdStatus: 'inbox',
        unread: true,
      }),
    ).toBe('unread')
  })

  it('returns nothing for an idle thread', () => {
    expect(
      threadRowStatuses({
        generating: false,
        namingTitle: false,
        queuedCount: 0,
        hasDraft: false,
      }),
    ).toEqual([])
  })
})

describe('generation elapsed time', () => {
  it('formats seconds, minutes, and hours compactly', () => {
    expect(formatElapsed(0)).toBe('0s')
    expect(formatElapsed(9_400)).toBe('9s')
    expect(formatElapsed(83_000)).toBe('1:23')
    expect(formatElapsed(3_723_000)).toBe('1:02:03')
    expect(formatElapsed(-50)).toBe('0s')
  })

  const row = (role: string, timestamp?: number): MessageRow => ({
    id: `${role}-${timestamp}`,
    threadId: 't',
    message: { id: 'm', role, parts: [] },
    timestamp,
  })

  it('starts at the latest user message when it predates observation', () => {
    expect(
      generationStartedAt(
        [row('user', 1_000), row('assistant', 2_000), row('user', 5_000)],
        9_000,
      ),
    ).toBe(5_000)
  })

  it('falls back to the observation time without a usable user timestamp', () => {
    expect(generationStartedAt([row('assistant', 2_000)], 9_000)).toBe(9_000)
    expect(generationStartedAt([row('user', 12_000)], 9_000)).toBe(9_000)
    expect(generationStartedAt([], 9_000)).toBe(9_000)
  })
})
