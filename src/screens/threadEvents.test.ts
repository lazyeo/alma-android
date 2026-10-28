import { describe, expect, it } from 'vitest'
import type { Thread } from '../relay'
import { applyThreadTitleEvent, shouldReloadThread } from './threadEvents'

const threads: Thread[] = [
  { id: 'a', title: 'New Chat' },
  { id: 'b', title: 'Existing title' },
]

describe('thread title events', () => {
  it('marks the matching thread while its title is generating', () => {
    expect(
      applyThreadTitleEvent(threads, {
        type: 'title_generating',
        data: { id: 'a', isGeneratingTitle: true },
      }),
    ).toEqual([
      { id: 'a', title: 'New Chat', isGeneratingTitle: true },
      threads[1],
    ])
  })

  it('replaces the title and clears the generating state', () => {
    expect(
      applyThreadTitleEvent(threads, {
        type: 'title_generated',
        data: {
          id: 'a',
          title: 'A generated title',
          isGeneratingTitle: false,
        },
      }),
    ).toEqual([
      {
        id: 'a',
        title: 'A generated title',
        isGeneratingTitle: false,
      },
      threads[1],
    ])
  })

  it('ignores unrelated events and unknown thread ids', () => {
    expect(
      applyThreadTitleEvent(threads, {
        type: 'message_added',
        data: { id: 'a' },
      }),
    ).toBe(threads)
    expect(
      applyThreadTitleEvent(threads, {
        type: 'title_generated',
        data: { id: 'missing', title: 'No match' },
      }),
    ).toBe(threads)
  })
})

describe('thread detail refresh events', () => {
  it('reloads the active thread for desktop thread_updated events', () => {
    expect(
      shouldReloadThread('thread-1', {
        type: 'thread_updated',
        data: {
          id: 'thread-1',
          metadata: {
            activePath: ['user-1', 'assistant-version-1'],
            savedTails: { 'assistant-version-2': [] },
          },
        },
      }),
    ).toBe(true)
  })

  it('ignores another thread and non-snapshot message events', () => {
    expect(
      shouldReloadThread('thread-1', {
        type: 'thread_updated',
        data: { id: 'thread-2' },
      }),
    ).toBe(false)
    expect(
      shouldReloadThread('thread-1', {
        type: 'message_added',
        data: { threadId: 'thread-1' },
      }),
    ).toBe(false)
  })
})
