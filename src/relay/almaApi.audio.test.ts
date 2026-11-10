import { describe, expect, it, vi } from 'vitest'
import { AlmaApi } from './almaApi'

const reply = (headers: Record<string, string>, status = 200) => ({
  status,
  headers,
  bytes: async () => new Uint8Array([0, 0, 0, 24]),
  text: async () => '',
})

const apiWith = (fetch: ReturnType<typeof vi.fn>) =>
  new AlmaApi({ fetch, openWebSocket: vi.fn() })

describe('AlmaApi.getAudio', () => {
  it('fetches voice bytes through the tunnel', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(reply({ 'Content-Type': 'audio/mp4' }))
    const blob = await apiWith(fetch).getAudio('/api/gallery/cache/a.m4a')
    expect(fetch).toHaveBeenCalledWith('/api/gallery/cache/a.m4a', {
      method: 'GET',
    })
    expect(blob.type).toBe('audio/mp4')
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(
      new Uint8Array([0, 0, 0, 24]),
    )
  })

  it('falls back to the declared type only for untyped files', async () => {
    const untyped = vi
      .fn()
      .mockResolvedValue(reply({ 'content-type': 'application/octet-stream' }))
    expect(
      (await apiWith(untyped).getAudio('/api/gallery/cache/a.m4a', 'audio/mp4'))
        .type,
    ).toBe('audio/mp4')
    const html = vi
      .fn()
      .mockResolvedValue(reply({ 'content-type': 'text/html' }))
    await expect(
      apiWith(html).getAudio('/api/gallery/cache/a.m4a', 'audio/mp4'),
    ).rejects.toThrow('Audio unavailable')
  })

  it('rejects missing files', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(reply({ 'content-type': 'audio/mp4' }, 404))
    await expect(
      apiWith(fetch).getAudio('/api/gallery/cache/a.m4a'),
    ).rejects.toThrow('Audio unavailable')
  })

  it('never leaves the gallery cache', async () => {
    const fetch = vi.fn()
    for (const path of [
      '/api/files-abs-binary?path=/etc/hosts',
      '/api/gallery/cache/../bun/execute',
      '/api/gallery/cache/a.m4a?x=1',
      'http://localhost:23001/api/gallery/cache/a.m4a',
    ])
      await expect(apiWith(fetch).getAudio(path)).rejects.toThrow()
    expect(fetch).not.toHaveBeenCalled()
  })
})
