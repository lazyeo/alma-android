import { describe, expect, it, vi } from 'vitest'
import { AlmaApi, assertSafePath } from './almaApi'

describe('thread loop API', () => {
  it('allows exactly GET, PUT and DELETE on /api/threads/:id/loop', () => {
    for (const method of ['GET', 'PUT', 'DELETE'])
      expect(() => assertSafePath('/api/threads/t1/loop', method)).not.toThrow()
    for (const method of ['POST', 'PATCH'])
      expect(() => assertSafePath('/api/threads/t1/loop', method)).toThrow(
        /blocked/i,
      )
    for (const path of [
      '/api/threads/t1/loop/tick',
      '/api/threads/t1/loop/',
      '/api/threads/t1/loop/x/y',
    ])
      expect(() => assertSafePath(path, 'GET')).toThrow(/blocked/i)
  })

  it('reads, starts and stops loops through the desktop contract', async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({
        loop: {
          prompt: 'check',
          intervalMs: 60_000,
          startedAt: 1,
          iterations: 0,
        },
        active: true,
        interval: '1m',
        stopped: 'check',
      }),
      text: async () => '',
    })
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() })
    const read = await api.getLoop('a/b')
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/threads/a%2Fb/loop',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(read.active).toBe(true)
    expect(read.loop?.prompt).toBe('check')

    const started = await api.setLoop('a', '  5m check  ', {
      model: 'provider:model',
    })
    expect(fetch.mock.calls.at(-1)![1].method).toBe('PUT')
    expect(JSON.parse(fetch.mock.calls.at(-1)![1].body)).toEqual({
      prompt: '5m check',
      model: 'provider:model',
    })
    expect(started.interval).toBe('1m')

    const calls = fetch.mock.calls.length
    await expect(api.setLoop('a', '   ')).rejects.toThrow()
    expect(fetch).toHaveBeenCalledTimes(calls)

    const stopped = await api.stopLoop('a')
    expect(fetch).toHaveBeenLastCalledWith(
      '/api/threads/a/loop',
      expect.objectContaining({ method: 'DELETE' }),
    )
    expect(stopped.stopped).toBe('check')
  })
})
