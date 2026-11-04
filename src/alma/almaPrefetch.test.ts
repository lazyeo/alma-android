import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MessageRow, Thread } from '../relay/almaApi'
import { createThreadCache } from '../relay/threadCache'
import {
  prefetchAlmaThread,
  PREFETCH_MAX_AGE_MS,
  resetAlmaPrefetch,
} from './almaPrefetch'

const row = (id: string) =>
  ({ id, message: { role: 'user', parts: [] } }) as unknown as MessageRow

function api(thread: Partial<Thread> = {}) {
  return {
    getThread: vi.fn(async () => ({
      id: 't',
      title: 'Main',
      messages: [row('a'), row('b')],
      ...thread,
    })) as unknown as (id: string) => Promise<Thread>,
    getMessages: vi.fn(async () => [row('m')]),
  }
}

afterEach(() => resetAlmaPrefetch())

describe('prefetchAlmaThread', () => {
  it('warms the thread cache with her rows', async () => {
    const cache = createThreadCache()
    await prefetchAlmaThread(api(), 'home', 't', { cache })
    expect(cache.getThread('home', 't')?.rows.map((r) => r.id)).toEqual([
      'a',
      'b',
    ])
    expect(cache.getThread('home', 't')?.title).toBe('Main')
  })

  it('shares one request between idle and pointer-down', async () => {
    const cache = createThreadCache()
    const source = api()
    const first = prefetchAlmaThread(source, 'home', 't', { cache })
    const second = prefetchAlmaThread(source, 'home', 't', { cache })
    expect(second).toBe(first)
    await first
    expect(source.getThread).toHaveBeenCalledTimes(1)
  })

  it('skips a fresh cache and refetches a stale one', async () => {
    const cache = createThreadCache()
    const source = api()
    let now = 1_000
    const clock = () => now
    await prefetchAlmaThread(source, 'home', 't', { cache, clock })
    now += PREFETCH_MAX_AGE_MS - 1
    await prefetchAlmaThread(source, 'home', 't', { cache, clock })
    expect(source.getThread).toHaveBeenCalledTimes(1)
    now += 2
    await prefetchAlmaThread(source, 'home', 't', { cache, clock })
    expect(source.getThread).toHaveBeenCalledTimes(2)
  })

  it('falls back to the messages endpoint and swallows failures', async () => {
    const cache = createThreadCache()
    await prefetchAlmaThread(api({ messages: undefined }), 'home', 't', {
      cache,
      fallbackTitle: 'Alma',
    })
    expect(cache.getThread('home', 't')?.rows.map((r) => r.id)).toEqual(['m'])
    const failing = {
      getThread: vi.fn(async () => {
        throw new Error('offline')
      }),
      getMessages: vi.fn(),
    }
    await expect(
      prefetchAlmaThread(failing, 'home', 'x', { cache }),
    ).resolves.toBeUndefined()
    expect(cache.getThread('home', 'x')).toBeUndefined()
  })
})
