import { describe, expect, it, vi } from 'vitest'
import {
  ThreadEventHub,
  generatingChange,
  reduceGeneratingIds,
} from './threadActivity'

const empty: ReadonlySet<string> = new Set()

describe('generating thread id reducer', () => {
  it('replaces the set from a generating snapshot', () => {
    const next = reduceGeneratingIds(new Set(['old']), {
      type: 'generating_snapshot',
      data: { ids: ['a', 'b'] },
    })
    expect([...next]).toEqual(['a', 'b'])
  })

  it('adds and removes ids from thread_generating, which keys by `id`', () => {
    const started = reduceGeneratingIds(empty, {
      type: 'thread_generating',
      data: { id: 'a', isGenerating: true },
    })
    expect(started.has('a')).toBe(true)
    const stopped = reduceGeneratingIds(started, {
      type: 'thread_generating',
      data: { id: 'a', isGenerating: false, reason: 'reset' },
    })
    expect(stopped.has('a')).toBe(false)
  })

  it('accepts a legacy threadId key on thread_generating', () => {
    const next = reduceGeneratingIds(empty, {
      type: 'thread_generating',
      data: { threadId: 'x', isGenerating: true },
    })
    expect(next.has('x')).toBe(true)
  })

  it.each(['generation_completed', 'generation_error', 'generation_stopped'])(
    'clears the thread on %s',
    (type) => {
      const next = reduceGeneratingIds(new Set(['a', 'b']), {
        type,
        data: { threadId: 'a' },
      })
      expect([...next]).toEqual(['b'])
    },
  )

  it('drops deleted threads', () => {
    const next = reduceGeneratingIds(new Set(['a']), {
      type: 'thread_deleted',
      data: { id: 'a' },
    })
    expect(next.size).toBe(0)
  })

  it('returns the same set when nothing changes so React can bail out', () => {
    const current = new Set(['a'])
    expect(
      reduceGeneratingIds(current, {
        type: 'thread_generating',
        data: { id: 'a', isGenerating: true },
      }),
    ).toBe(current)
    expect(
      reduceGeneratingIds(current, { type: 'message_delta', data: {} }),
    ).toBe(current)
    expect(
      reduceGeneratingIds(current, {
        type: 'generating_snapshot',
        data: { ids: ['a'] },
      }),
    ).toBe(current)
  })

  it('ignores malformed payloads', () => {
    expect(
      reduceGeneratingIds(empty, {
        type: 'thread_generating',
        data: { isGenerating: true },
      }),
    ).toBe(empty)
    expect(
      reduceGeneratingIds(empty, {
        type: 'generating_snapshot',
        data: { ids: 'nope' },
      }).size,
    ).toBe(0)
  })
})

describe('generatingChange for one open thread', () => {
  it('reports start, finish, and no-op events', () => {
    expect(
      generatingChange('a', {
        type: 'thread_generating',
        data: { id: 'a', isGenerating: true },
      }),
    ).toBe(true)
    expect(
      generatingChange('a', {
        type: 'generating_snapshot',
        data: { ids: ['b'] },
      }),
    ).toBe(false)
    expect(
      generatingChange('a', {
        type: 'generation_completed',
        data: { threadId: 'a' },
      }),
    ).toBe(false)
    expect(
      generatingChange('a', {
        type: 'thread_generating',
        data: { id: 'b', isGenerating: true },
      }),
    ).toBeUndefined()
  })
})

describe('ThreadEventHub', () => {
  it('fans one desktop socket out to that desktop only', () => {
    const hub = new ThreadEventHub()
    const home = vi.fn()
    const work = vi.fn()
    hub.subscribe('home', home)
    const off = hub.subscribe('work', work)
    hub.publish('home', { type: 'thread_created', data: {} })
    expect(home).toHaveBeenCalledTimes(1)
    expect(work).not.toHaveBeenCalled()
    off()
    hub.publish('work', { type: 'thread_created', data: {} })
    expect(work).not.toHaveBeenCalled()
  })

  it('isolates a throwing listener from the others', () => {
    const hub = new ThreadEventHub()
    const ok = vi.fn()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    hub.subscribe('home', () => {
      throw new Error('boom')
    })
    hub.subscribe('home', ok)
    hub.publish('home', { type: 'x', data: {} })
    expect(ok).toHaveBeenCalled()
    spy.mockRestore()
  })
})
