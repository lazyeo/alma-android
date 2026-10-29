import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  LATEST_RELEASE_API,
  UpdateCheckError,
  fetchLatestRelease,
} from './updateCheck'

const payload = {
  tag_name: 'v0.1.3',
  draft: false,
  prerelease: false,
  html_url: 'https://github.com/lazyeo/alma-android/releases/tag/v0.1.3',
  body: '- Update check',
  assets: [],
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

async function failure(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(UpdateCheckError)
    return (error as UpdateCheckError).kind
  }
  throw new Error('expected the check to fail')
}

describe('latest release check', () => {
  afterEach(() => vi.useRealTimers())

  it('asks the GitHub API anonymously for the latest release', async () => {
    const fetch = vi.fn(async () => json(payload))
    const release = await fetchLatestRelease({ fetch, isOnline: () => true })
    expect(release?.version).toBe('0.1.3')
    expect(LATEST_RELEASE_API).toBe(
      'https://api.github.com/repos/lazyeo/alma-android/releases/latest',
    )
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(LATEST_RELEASE_API)
    expect(init.method).toBe('GET')
    expect(init.credentials).toBe('omit')
    expect(new Headers(init.headers).get('accept')).toBe(
      'application/vnd.github+json',
    )
    expect(new Headers(init.headers).has('authorization')).toBe(false)
  })

  it('reports no release when none is published or it is a prerelease', async () => {
    await expect(
      fetchLatestRelease({
        fetch: async () => json({ message: 'Not Found' }, 404),
        isOnline: () => true,
      }),
    ).resolves.toBeUndefined()
    await expect(
      fetchLatestRelease({
        fetch: async () => json({ ...payload, prerelease: true }),
        isOnline: () => true,
      }),
    ).resolves.toBeUndefined()
  })

  it('maps a 403 to the rate-limit error', async () => {
    expect(
      await failure(
        fetchLatestRelease({
          fetch: async () => json({ message: 'API rate limit exceeded' }, 403),
          isOnline: () => true,
        }),
      ),
    ).toBe('rateLimited')
  })

  it('maps a network failure while offline to the offline error', async () => {
    expect(
      await failure(
        fetchLatestRelease({
          fetch: async () => {
            throw new TypeError('Failed to fetch')
          },
          isOnline: () => false,
        }),
      ),
    ).toBe('offline')
  })

  it('maps server errors and unreadable bodies to the general error', async () => {
    expect(
      await failure(
        fetchLatestRelease({
          fetch: async () => json({}, 502),
          isOnline: () => true,
        }),
      ),
    ).toBe('general')
    expect(
      await failure(
        fetchLatestRelease({
          fetch: async () => new Response('<html>', { status: 200 }),
          isOnline: () => true,
        }),
      ),
    ).toBe('general')
  })

  it('aborts and reports a timeout when GitHub does not answer', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    const check = fetchLatestRelease({
      timeoutMs: 1_000,
      isOnline: () => true,
      fetch: (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          signal = init?.signal ?? undefined
          signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          )
        }),
    })
    const kind = failure(check)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await kind).toBe('timeout')
    expect(signal?.aborted).toBe(true)
  })
})
