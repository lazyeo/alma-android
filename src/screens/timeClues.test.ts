import { describe, expect, it } from 'vitest'
import {
  groupTimeClues,
  naturalTimeClueRange,
  parseTimeClues,
  timeClueAnchor,
  timeClueRangeId,
  timeCluesHaveUnread,
  timeClueHasActions,
  type TimeClueEntry,
} from './timeClues'

describe('time clue ranges', () => {
  const now = new Date('2026-10-25T00:30:00Z')

  it('uses the local day in the requested timezone', () => {
    expect(
      naturalTimeClueRange('today', now, 'America/Los_Angeles'),
    ).toMatchObject({ startDate: '2026-10-24', endDate: '2026-10-25' })
  })

  it('uses Monday through Sunday for desktop-compatible weeks', () => {
    expect(
      naturalTimeClueRange('this-week', now, 'America/Los_Angeles'),
    ).toMatchObject({ startDate: '2026-10-19', endDate: '2026-10-26' })
    expect(
      naturalTimeClueRange('next-week', now, 'America/Los_Angeles'),
    ).toMatchObject({ startDate: '2026-10-26', endDate: '2026-11-02' })
  })

  it('builds the exact range id used by desktop requests', () => {
    expect(
      timeClueRangeId({
        startDate: '2026-10-24',
        endDate: '2026-10-25',
        timeZone: 'America/Los_Angeles',
      }),
    ).toBe('2026-10-24..2026-10-25~America/Los_Angeles')
  })
})

describe('time clue response parsing', () => {
  const response = parseTimeClues({
    clues: [
      {
        id: 'clue-1',
        expression: 'before Friday',
        quote: 'Finish this before Friday',
        date: '2026-10-23',
        endDate: null,
        time: null,
        threadId: 'thread-1',
        threadTitle: 'Release plan',
        sourceUri: 'alma://thread/thread-1/message/message-7',
        seen: false,
      },
    ],
    scheduled: [
      {
        id: 'cron:job-1',
        jobId: 'job-1',
        uri: 'alma://cron/job-1',
        name: 'Publish report',
        dueAt: '2026-10-24T16:30:00.000Z',
        date: '2026-10-24',
        endDate: null,
        time: '09:30',
        fired: false,
        threadId: 'thread-2',
        threadTitle: 'Weekly report',
        threadUri: 'alma://thread/thread-2',
      },
    ],
    unread: 1,
    hasMore: false,
    nextOffset: null,
  })

  it('parses clues and scheduled rows', () => {
    expect(response.clues[0]).toMatchObject({
      id: 'clue-1',
      expression: 'before Friday',
      seen: false,
    })
    expect(response.scheduled[0]).toMatchObject({
      id: 'cron:job-1',
      name: 'Publish report',
      time: '09:30',
    })
  })

  it('extracts a message anchor from a source uri', () => {
    expect(timeClueAnchor(response.clues[0])).toEqual({
      threadId: 'thread-1',
      anchorId: 'message-7',
    })
  })

  it('groups by date and sorts timed entries before untimed entries', () => {
    const groups = groupTimeClues(
      [...response.clues, ...response.scheduled],
      '2026-10-24',
    )
    expect(groups.map((group) => group.date)).toEqual([
      '2026-10-23',
      '2026-10-24',
    ])
  })

  it('derives the dot from current-day unseen clues, not overdue clues', () => {
    expect(timeCluesHaveUnread(response, '2026-10-24')).toBe(false)
    expect(
      timeCluesHaveUnread(
        parseTimeClues({
          ...response,
          clues: [{ ...response.clues[0], date: '2026-10-24' }],
        }),
        '2026-10-24',
      ),
    ).toBe(true)
  })
})

describe('time clue actions', () => {
  it('offers actions only for conversation clues', () => {
    expect(timeClueHasActions({ kind: 'clue' } as TimeClueEntry)).toBe(true)
    expect(timeClueHasActions({ kind: 'scheduled' } as TimeClueEntry)).toBe(
      false,
    )
  })
})
