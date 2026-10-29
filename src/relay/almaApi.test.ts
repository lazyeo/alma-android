import { describe, expect, it, vi } from 'vitest'
import {
  MAX_RELAY_UPLOAD_BYTES,
  AlmaApi,
  assertSafePath,
  isUnsupportedEndpoint,
  rootRows,
} from './almaApi'
import type { MessageRow } from './almaApi'

describe('Alma API safety', () => {
  it.each([
    ['/api/bun/execute', 'GET'],
    ['/api/computer-use/click', 'GET'],
    ['/api/data/import', 'GET'],
    ['/api/data/export', 'GET'],
    ['/api/settings', 'PUT'],
    ['/api/providers', 'POST'],
    ['/api/providers/x', 'PUT'],
    ['/api/threads/batch-delete', 'GET'],
    ['/api/terminal', 'GET'],
    ['/ws/terminal/1', 'WS'],
  ])('blocks %s before sending', (path, method) => {
    expect(() => assertSafePath(path, method)).toThrow(/blocked/i)
  })

  it('allows the Herdr HTTP and WebSocket bridge paths', () => {
    for (const [path, method] of [
      ['/api/herdr/info', 'GET'],
      ['/api/herdr/chat?pane=w1%3Ap1', 'GET'],
      ['/api/herdr/rpc', 'POST'],
      ['/api/herdr/mutes', 'PUT'],
      ['/ws/herdr', 'WS'],
      ['/ws/herdr/chat?pane=w1%3Ap1&from=0', 'WS'],
      ['/ws/herdr/screen?pane=w1%3Ap1', 'WS'],
    ] as const)
      expect(() => assertSafePath(path, method)).not.toThrow()
  })

  it('allows settings reads but blocks settings writes', () => {
    expect(() => assertSafePath('/api/settings', 'GET')).not.toThrow()
    expect(() => assertSafePath('/api/settings', 'PUT')).toThrow()
  })

  it('allows only the explicit reference endpoint allowlist', () => {
    for (const path of [
      '/api/refs/kinds',
      '/api/refs/search?q=roadmap',
      '/api/refs/recent?limit=20',
      '/api/refs/resolve?uri=alma%3A%2F%2Fthread%2Fa',
      '/api/refs/backlinks?uri=alma%3A%2F%2Fthread%2Fa',
      '/api/refs/recipes?threadId=thread-1',
      '/api/refs/time-clues?range=x',
      '/api/refs/time-clues/days?range=x',
      '/api/refs/scratch',
    ])
      expect(() => assertSafePath(path, 'GET')).not.toThrow()
    for (const path of [
      '/api/refs/resolve',
      '/api/refs/backlink-counts',
      '/api/refs/recipes/state',
      '/api/refs/time-clues/seen',
      '/api/refs/time-clues/ignore',
    ])
      expect(() => assertSafePath(path, 'POST')).not.toThrow()
    for (const path of [
      '/api/refs/open',
      '/api/refs/link',
      '/api/refs/unlink',
      '/api/refs/scratch/write',
      '/api/refs/snippets',
      '/api/refs/translate',
      '/api/refs/reindex',
    ])
      expect(() => assertSafePath(path, 'GET')).toThrow(/blocked/i)
    expect(() => assertSafePath('/api/refs/search', 'POST')).toThrow(/blocked/i)
    // Selection snippets: create only; rename/delete/turn bundles stay desktop-side.
    expect(() => assertSafePath('/api/refs/snippets', 'POST')).not.toThrow()
    for (const [path, verb] of [
      ['/api/refs/snippets/s1', 'PATCH'],
      ['/api/refs/snippets/s1', 'DELETE'],
      ['/api/refs/snippets/from-turns', 'POST'],
    ])
      expect(() => assertSafePath(path, verb)).toThrow(/blocked/i)
  })

  it('omits threadId from reference search and resolution when unavailable', async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ query: '', results: [] }),
      text: async () => '',
      headers: {},
    })
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)

    await api.searchRefs({ q: 'roadmap', workspaceId: 'workspace-1' })
    await api.resolveRefs(['alma://thread/a'])

    expect(fetch.mock.calls[0][0]).toBe(
      '/api/refs/search?q=roadmap&workspaceId=workspace-1',
    )
    expect(fetch.mock.calls[1]).toEqual([
      '/api/refs/resolve',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ uris: ['alma://thread/a'] }),
      }),
    ])
  })

  it('allows only read-only crystal endpoints', () => {
    expect(() => assertSafePath('/api/crystal/overview', 'GET')).not.toThrow()
    expect(() => assertSafePath('/api/crystal/cry_1', 'GET')).not.toThrow()
    expect(() => assertSafePath('/api/crystal/cry_1', 'POST')).toThrow(
      /blocked/i,
    )
  })

  it('reads models and settings without attempting a settings write', async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ data: [] }),
      text: async () => '',
      headers: {},
    })
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)
    await api.listModels()
    await api.getSettings()
    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/models',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/settings',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('reads recipes and persists their dismissed or extracted state', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ threadId: 'thread-1', open: [], all: [] }),
        text: async () => '',
        headers: {},
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ ok: true }),
        text: async () => '',
        headers: {},
      })
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)

    await api.listRecipes('thread-1')
    await api.setRecipeState('thread-1', 'recipe-1', 'extracted')

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/refs/recipes?threadId=thread-1',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/refs/recipes/state',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          threadId: 'thread-1',
          recipeId: 'recipe-1',
          state: 'extracted',
        }),
      }),
    )
  })

  it('reads parsed backlinks for one encoded reference uri', async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ backlinks: [{ threadId: 't1', title: 'Plan' }] }),
      text: async () => '',
      headers: {},
    })
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)

    await expect(api.getBacklinks('alma://thread/a')).resolves.toEqual([
      { threadId: 't1', title: 'Plan' },
    ])
    expect(fetch).toHaveBeenCalledWith(
      '/api/refs/backlinks?uri=alma%3A%2F%2Fthread%2Fa',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('writes GTD metadata through PUT /api/threads/:id', async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ id: 'thread-1' }),
      text: async () => '',
      headers: {},
    })
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)
    const metadata = {
      gtdStatus: 'done',
      autoTodo: { what: 'Ship it', quote: 'ship it', at: 100 },
    }

    await api.updateThread('thread 1', { metadata, skipUpdatedAt: true })

    expect(fetch).toHaveBeenCalledWith(
      '/api/threads/thread%201',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ metadata, skipUpdatedAt: true }),
      }),
    )
  })

  it('writes favorite fields at the top level of the same PUT', async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ id: 'thread-1' }),
      text: async () => '',
      headers: {},
    })
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)
    const update = {
      isFavorited: false,
      isFavoritePinned: false,
      favoritePinnedOrder: null,
      skipUpdatedAt: true,
    }

    await api.updateThread('thread-1', update)

    expect(fetch).toHaveBeenCalledWith(
      '/api/threads/thread-1',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify(update),
      }),
    )
    expect(() => assertSafePath('/api/threads/thread-1', 'PUT')).not.toThrow()
  })

  it('creates threads through the tunnel with the desktop auto-title sentinel', async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ id: 'new' }),
      text: async () => '',
      headers: {},
    })
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)
    await expect(api.createThread()).resolves.toEqual({ id: 'new' })
    expect(fetch).toHaveBeenCalledWith(
      '/api/threads',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ title: 'New Chat' }),
      }),
    )
  })

  it('lists workspaces and creates a thread in the selected workspace', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => [{ id: 'workspace-1', name: 'Project One' }],
        text: async () => '',
        headers: {},
      })
      .mockResolvedValueOnce({
        status: 201,
        json: async () => ({ id: 'new', workspaceId: 'workspace-1' }),
        text: async () => '',
        headers: {},
      })
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)

    await expect(api.listWorkspaces()).resolves.toEqual([
      { id: 'workspace-1', name: 'Project One' },
    ])
    await api.createThread('New Chat', 'workspace-1')

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/workspaces',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/threads',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          title: 'New Chat',
          workspaceId: 'workspace-1',
        }),
      }),
    )
  })

  it('lists previewable HTML files of one workspace', async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ htmlFiles: ['index.html'] }),
      text: async () => '',
      headers: {},
    })
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)

    await expect(api.listPreviewHtmlFiles('ws 1')).resolves.toEqual({
      htmlFiles: ['index.html'],
    })
    expect(fetch).toHaveBeenCalledWith(
      '/api/workspaces/ws%201/preview/html-files',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('switches message versions with the desktop direction body', async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ id: 'assistant-2' }),
      text: async () => '',
      headers: {},
    })
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)

    await api.switchMessageVersion('assistant-1', 'next')

    expect(fetch).toHaveBeenCalledWith(
      '/api/messages/assistant-1/switch-version',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ direction: 'next' }),
      }),
    )
  })

  it('rejects raw attachment bodies above the conservative relay cap before sending', async () => {
    const fetch = vi.fn()
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)
    const bytes = new Uint8Array(MAX_RELAY_UPLOAD_BYTES + 1)

    expect(() =>
      api.uploadFile(bytes, 'large.bin', 'application/octet-stream'),
    ).toThrow(/single encrypted frame/i)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('uploads raw image and file bytes with desktop headers', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ url: 'http://localhost/image.png' }),
        text: async () => '',
        headers: {},
      })
      .mockResolvedValueOnce({
        status: 200,
        json: async () => ({ filePath: '/tmp/note.txt' }),
        text: async () => '',
        headers: {},
      })
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)
    const bytes = new Uint8Array([1, 2, 3])

    await api.uploadImage(bytes, 'image/png')
    await api.uploadFile(bytes, 'hello world.txt', 'text/plain')

    expect(fetch).toHaveBeenNthCalledWith(1, '/api/attachments/image', {
      method: 'POST',
      headers: { 'content-type': 'image/png' },
      body: bytes,
    })
    expect(fetch).toHaveBeenNthCalledWith(2, '/api/attachments/file', {
      method: 'POST',
      headers: {
        'content-type': 'text/plain',
        'x-alma-filename': encodeURIComponent('hello world.txt'),
      },
      body: bytes,
    })
  })

  it('reads the desktop name from /api/health', async () => {
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ name: 'Mac mini', status: 'ok', timestamp: 1 }),
      text: async () => '',
      headers: {},
    })
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)
    await expect(api.getHealth()).resolves.toMatchObject({ name: 'Mac mini' })
    expect(fetch).toHaveBeenCalledWith(
      '/api/health',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('flags missing handoff routes on older desktops as unsupported', async () => {
    const respond = (status: number) =>
      vi.fn().mockResolvedValue({
        status,
        json: async () => ({}),
        text: async () => 'Not Found',
        headers: {},
      })
    const missing = new AlmaApi({
      fetch: respond(404),
      openWebSocket: vi.fn(),
    } as any)
    const broken = new AlmaApi({
      fetch: respond(500),
      openWebSocket: vi.fn(),
    } as any)
    const missingError = await missing.listApprovals().catch((e) => e)
    const brokenError = await broken.listApprovals().catch((e) => e)
    expect(isUnsupportedEndpoint(missingError)).toBe(true)
    expect(isUnsupportedEndpoint(brokenError)).toBe(false)
    expect(isUnsupportedEndpoint(new Error('offline'))).toBe(false)
    expect(String(missingError.message)).toMatch(/failed \(404\)/)
  })
})

it('rootRows keeps every row whose depth is an ordinal and drops sub-agent rows', () => {
  const row = (id: string, depth: number, parentToolCallId: string | null) =>
    ({
      id,
      threadId: 't',
      depth,
      parentToolCallId,
      message: { id, role: 'assistant', parts: [] },
    }) as never
  const rows = [
    row('a', 0, null),
    row('b', 1, null),
    row('sub', 0, 'toolu_1'),
    row('c', 2, null),
  ]
  expect(rootRows(rows).map((r: MessageRow) => r.id)).toEqual(['a', 'b', 'c'])
})

describe('context usage and compaction routes', () => {
  const ok = (body: unknown) =>
    vi.fn().mockResolvedValue({
      status: 200,
      json: async () => body,
      text: async () => '',
      headers: {},
    })

  it('reads context usage with the required model query', async () => {
    const fetch = ok({
      threadId: 't 1',
      usagePercent: 12.5,
      totalTokens: 16000,
      contextWindow: 128000,
    })
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)
    const usage = await api.getContextUsage('t 1', 'openai:gpt-5')
    expect(fetch).toHaveBeenCalledWith(
      '/api/threads/t%201/context-usage?model=openai%3Agpt-5',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(usage.usagePercent).toBe(12.5)
  })

  it('compacts with the desktop handler body shape', async () => {
    const fetch = ok({ success: true, compactedCount: 4, savedTokens: 900 })
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)
    const result = await api.compactThread('t1', 'openai:gpt-5')
    const [path, init] = fetch.mock.calls[0]
    expect(path).toBe('/api/threads/t1/compact')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ model: 'openai:gpt-5' })
    expect(result).toEqual({
      success: true,
      compactedCount: 4,
      savedTokens: 900,
    })
  })

  it('omits the model so the desktop falls back to the thread model', async () => {
    const fetch = ok({ success: false, code: 'nothing_to_compact' })
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)
    await api.compactThread('t1')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({})
  })
})

describe('thread file writes', () => {
  it('reads GET /api/threads/:id/file-writes', async () => {
    const fileWrites = [
      {
        type: 'write' as const,
        filePath: '/workspace/a.ts',
        content: 'export {}',
        messageId: 'm1',
        toolCallId: 'w1',
        timestamp: '2026-10-27T10:00:00.000Z',
      },
    ]
    const fetch = vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ fileWrites }),
      text: async () => '',
      headers: {},
    })
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)

    expect(await api.getThreadFileWrites('t 1')).toEqual({ fileWrites })
    expect(fetch).toHaveBeenCalledWith(
      '/api/threads/t%201/file-writes',
      expect.objectContaining({ method: 'GET' }),
    )
  })
})

describe('live sub-agent snapshots', () => {
  const respond = (status: number, body: unknown) =>
    vi.fn().mockResolvedValue({
      status,
      json: async () => body,
      text: async () => '',
      headers: {},
    })

  it('reads GET /api/threads/:id/subagents/live', async () => {
    const snapshot = {
      context: {
        threadId: 't 1',
        parentToolCallId: 'call-1',
        subagentMessageId: 'subagent-a-1',
      },
      lastSeq: 4,
      message: { id: '', role: 'assistant', parts: [] },
    }
    const fetch = respond(200, [snapshot])
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as any)
    expect(await api.getLiveSubagents('t 1')).toEqual([snapshot])
    expect(fetch).toHaveBeenCalledWith(
      '/api/threads/t%201/subagents/live',
      expect.objectContaining({ method: 'GET' }),
    )
  })

  it('treats a missing route on older desktops as no live runs', async () => {
    const api = new AlmaApi({
      fetch: respond(404, {}),
      openWebSocket: vi.fn(),
    } as any)
    expect(await api.getLiveSubagents('t1')).toEqual([])
    const broken = new AlmaApi({
      fetch: respond(500, {}),
      openWebSocket: vi.fn(),
    } as any)
    await expect(broken.getLiveSubagents('t1')).rejects.toThrow()
  })
})
