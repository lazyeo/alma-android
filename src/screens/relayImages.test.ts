import { expect, it, vi } from 'vitest'
import { AlmaApi, assertSafePath } from '../relay/almaApi'
import { desktopImagePath, ImageCache } from './relayImages'

it('normalizes desktop images without accepting foreign origins or unsafe paths', () => {
  for (const url of [
    '/api/gallery/cache/a.jpg',
    'http://localhost:23001/api/gallery/cache/a.jpg',
    'http://127.0.0.1:23001/api/gallery/cache/a.jpg',
  ])
    expect(desktopImagePath(url)).toBe('/api/gallery/cache/a.jpg')
  for (const url of [
    'https://example.com/api/x',
    '//evil/api/x',
    'http://localhost:9999/api/x',
    '/api/bun/execute',
  ])
    expect(() => desktopImagePath(url)).toThrow()
})
it('gallery cache is read-only and existing deny rules still apply', () => {
  expect(() => assertSafePath('/api/gallery/cache/a.jpg')).not.toThrow()
  for (const method of ['POST', 'PUT', 'DELETE', 'HEAD'])
    expect(() => assertSafePath('/api/gallery/cache/a.jpg', method)).toThrow()
  expect(() => assertSafePath('/api/computer-use/click')).toThrow()
})
it('fetches exact image bytes through the owning API and bounds its LRU', async () => {
  const fetch = vi.fn().mockResolvedValue({
    status: 200,
    headers: { 'content-type': 'image/jpeg' },
    bytes: async () => new Uint8Array([255, 216, 255]),
  })
  const api = new AlmaApi({ fetch, openWebSocket: vi.fn() })
  const cache = new ImageCache(api, 2)
  expect(
    new Uint8Array(
      await (await cache.get('/api/gallery/cache/a')).arrayBuffer(),
    ),
  ).toEqual(new Uint8Array([255, 216, 255]))
  await cache.get('/api/gallery/cache/b')
  await cache.get('/api/gallery/cache/a')
  await cache.get('/api/gallery/cache/c')
  await cache.get('/api/gallery/cache/b')
  expect(fetch).toHaveBeenCalledTimes(4)
  expect(fetch).toHaveBeenCalledWith('/api/gallery/cache/a', { method: 'GET' })
})
it('does not cache errors or non-images', async () => {
  const fetch = vi.fn().mockResolvedValue({
    status: 200,
    headers: { 'content-type': 'text/html' },
  })
  const cache = new ImageCache(new AlmaApi({ fetch, openWebSocket: vi.fn() }))
  await expect(cache.get('/api/x')).rejects.toThrow()
  await expect(cache.get('/api/x')).rejects.toThrow()
  expect(fetch).toHaveBeenCalledTimes(2)
})
