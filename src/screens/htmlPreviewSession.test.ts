import { describe, expect, it, vi } from 'vitest'
import {
  NATIVE_PREVIEW_TIMEOUT_MS,
  createHtmlPreviewSessions,
  type HtmlPreviewNative,
  type HtmlPreviewRequest,
} from './htmlPreviewSession'

const TOKEN = 'a'.repeat(32)

function fakeNative() {
  let listener: ((request: HtmlPreviewRequest) => void) | undefined
  const calls: Array<[string, unknown]> = []
  const record =
    (name: string) =>
    async (options: unknown): Promise<void> => {
      calls.push([name, options])
    }
  const native: HtmlPreviewNative = {
    openSession: vi.fn(async () => ({ token: TOKEN, ownerKey: 'owner' })),
    closeSession: vi.fn(record('closeSession')),
    respond: vi.fn(record('respond')),
    addListener: vi.fn(async (_event, next) => {
      listener = next
      return { remove: async () => undefined }
    }),
  }
  return {
    native,
    calls,
    request: async (request: HtmlPreviewRequest) => {
      listener?.(request)
      await vi.waitFor(() =>
        expect(
          calls.some(
            ([name, options]) =>
              name === 'respond' &&
              (options as { requestId: string }).requestId ===
                request.requestId,
          ),
        ).toBe(true),
      )
    },
  }
}

function fakeApi(
  files: Record<string, { status?: number; body?: Uint8Array; type?: string }>,
) {
  const fetch = vi.fn(async (endpoint: string) => {
    const path = new URLSearchParams(endpoint.split('?')[1]).get('path') ?? ''
    const file = files[path]
    if (!file)
      return {
        status: 404,
        headers: {},
        bytes: async () => new Uint8Array(),
        text: async () => '',
        json: async () => ({}),
      }
    return {
      status: file.status ?? 200,
      headers: file.type ? { 'Content-Type': file.type } : {},
      bytes: async () => file.body ?? new Uint8Array(),
      text: async () => '',
      json: async () => ({}),
    }
  })
  return { api: { tunnel: { fetch } } as never, fetch }
}

describe('native HTML preview sessions', () => {
  it('opens a token origin and serves the entry and sibling files', async () => {
    const { native, calls, request } = fakeNative()
    const { api, fetch } = fakeApi({
      '/home/example/site/index.html': {
        body: new TextEncoder().encode('<h1>Hi</h1>'),
        type: 'text/html',
      },
      '/home/example/site/css/a.css': {
        body: new TextEncoder().encode('h1{}'),
        type: 'text/plain',
      },
    })
    const sessions = createHtmlPreviewSessions(native)
    const session = await sessions.open(api, '/home/example/site/index.html')

    expect(session.url).toBe(
      `https://alma-preview.localhost/${TOKEN}/index.html`,
    )
    await request({ requestId: 'r1', token: TOKEN, path: '' })
    await request({ requestId: 'r2', token: TOKEN, path: 'css/a.css' })

    expect(fetch).toHaveBeenCalledWith(
      `/api/files-abs-binary?path=${encodeURIComponent('/home/example/site/index.html')}`,
      expect.objectContaining({ method: 'GET' }),
    )
    expect(calls).toContainEqual([
      'respond',
      expect.objectContaining({
        requestId: 'r1',
        status: 200,
        mimeType: 'text/html',
      }),
    ])
    expect(calls).toContainEqual([
      'respond',
      expect.objectContaining({
        requestId: 'r2',
        status: 200,
        mimeType: 'text/css',
      }),
    ])
    expect(calls).toContainEqual([
      'respond',
      expect.objectContaining({
        requestId: 'r2',
        base64Chunks: [btoa('h1{}')],
      }),
    ])
  })

  it('sends large bodies in bounded chunks', async () => {
    const { native, calls, request } = fakeNative()
    const body = new Uint8Array(256 * 1024 * 2 + 10)
    const { api } = fakeApi({ '/site/big.bin': { body } })
    await createHtmlPreviewSessions(native).open(api, '/site/index.html')
    await request({ requestId: 'big', token: TOKEN, path: 'big.bin' })
    expect(
      (
        calls.find(
          ([name, options]) =>
            name === 'respond' &&
            (options as { requestId: string }).requestId === 'big',
        )?.[1] as { base64Chunks: string[] }
      ).base64Chunks,
    ).toHaveLength(3)
  })

  it('refuses escapes, unknown tokens and revoked tokens with 403', async () => {
    const { native, calls, request } = fakeNative()
    const { api, fetch } = fakeApi({})
    const session = await createHtmlPreviewSessions(native).open(
      api,
      '/site/index.html',
    )
    await request({ requestId: 'esc', token: TOKEN, path: '../secret' })
    await request({ requestId: 'other', token: 'b'.repeat(32), path: '' })
    await session.close()
    await request({ requestId: 'late', token: TOKEN, path: '' })

    expect(native.closeSession).toHaveBeenCalledWith({
      token: TOKEN,
      ownerKey: 'owner',
    })
    for (const requestId of ['esc', 'other', 'late'])
      expect(calls).toContainEqual([
        'respond',
        expect.objectContaining({ requestId, status: 403 }),
      ])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('closes idempotently', async () => {
    const { native } = fakeNative()
    const session = await createHtmlPreviewSessions(native).open(
      fakeApi({}).api,
      '/site/index.html',
    )
    await session.close()
    await session.close()
    expect(native.closeSession).toHaveBeenCalledTimes(1)
  })

  it('passes desktop misses through and times out stalled fetches', async () => {
    vi.useFakeTimers()
    try {
      const { native, calls } = fakeNative()
      let listener: ((request: HtmlPreviewRequest) => void) | undefined
      vi.mocked(native.addListener).mockImplementation(async (_e, next) => {
        listener = next
        return { remove: async () => undefined }
      })
      const fetch = vi.fn(
        (_endpoint: string, init: { signal?: AbortSignal }) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError')),
            ),
          ),
      )
      await createHtmlPreviewSessions(native).open(
        { tunnel: { fetch } } as never,
        '/site/index.html',
      )
      listener?.({ requestId: 'slow', token: TOKEN, path: '' })
      await vi.advanceTimersByTimeAsync(NATIVE_PREVIEW_TIMEOUT_MS)
      expect(NATIVE_PREVIEW_TIMEOUT_MS).toBe(20_000)
      expect(calls).toContainEqual([
        'respond',
        expect.objectContaining({
          ownerKey: 'owner',
          requestId: 'slow',
          status: 504,
        }),
      ])
    } finally {
      vi.useRealTimers()
    }
    const { native, calls, request } = fakeNative()
    await createHtmlPreviewSessions(native).open(
      fakeApi({}).api,
      '/site/index.html',
    )
    await request({ requestId: 'gone', token: TOKEN, path: 'missing.css' })
    expect(calls).toContainEqual([
      'respond',
      expect.objectContaining({
        ownerKey: 'owner',
        requestId: 'gone',
        status: 404,
      }),
    ])
  })
})
