import { beforeEach, describe, expect, it, vi } from 'vitest'
import { clearSiteIconCache, getCachedSiteIcon } from './siteIconCache'

beforeEach(() => clearSiteIconCache())

describe('site icon cache', () => {
  it('fetches an origin once for multiple links', async () => {
    const fetchIcon = vi.fn().mockResolvedValue('data:image/png;base64,icon')

    await expect(
      getCachedSiteIcon('https://example.com/one', fetchIcon),
    ).resolves.toBe('data:image/png;base64,icon')
    await expect(
      getCachedSiteIcon('https://example.com/two', fetchIcon),
    ).resolves.toBe('data:image/png;base64,icon')

    expect(fetchIcon).toHaveBeenCalledOnce()
    expect(fetchIcon).toHaveBeenCalledWith('https://example.com/one')
  })

  it('deduplicates concurrent requests for the same origin', async () => {
    let resolveIcon: (value: string | null) => void = () => undefined
    const fetchIcon = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          resolveIcon = resolve
        }),
    )

    const first = getCachedSiteIcon('https://example.com/one', fetchIcon)
    const second = getCachedSiteIcon('https://example.com/two', fetchIcon)
    resolveIcon('data:image/png;base64,icon')

    await expect(Promise.all([first, second])).resolves.toEqual([
      'data:image/png;base64,icon',
      'data:image/png;base64,icon',
    ])
    expect(fetchIcon).toHaveBeenCalledOnce()
  })

  it('negative-caches failures for the app run', async () => {
    const fetchIcon = vi.fn().mockRejectedValue(new Error('offline'))

    await expect(
      getCachedSiteIcon('https://example.com/one', fetchIcon),
    ).resolves.toBeNull()
    await expect(
      getCachedSiteIcon('https://example.com/two', fetchIcon),
    ).resolves.toBeNull()

    expect(fetchIcon).toHaveBeenCalledOnce()
  })
})
