import { describe, expect, it, vi } from 'vitest'
import { AlmaApi } from '../relay/almaApi'

const MINI = '0123456789abcdef'

const reply = (value: unknown, status = 200, contentType = '') => ({
  status,
  headers: contentType ? { 'content-type': contentType } : {},
  bytes: async () => new Uint8Array([1, 2, 3]),
  text: async () => JSON.stringify(value),
  json: async <T>() => value as T,
})

const desktop = (fetch = vi.fn().mockResolvedValue(reply({}))) => ({
  fetch,
  api: new AlmaApi({ fetch, openWebSocket: vi.fn() } as never),
})

describe('Herdr computer prefix', () => {
  it('sends every Herdr route of a remote computer through the computers proxy', async () => {
    const { api, fetch } = desktop(
      vi.fn().mockResolvedValue(reply({ result: {}, workspaces: [] })),
    )
    const mini = api.forHerdrComputer(MINI)

    await mini.getHerdrInfo()
    await mini.getHerdrMutes()
    await mini.setHerdrWorkspaceMuted('w1', true)
    await mini.promptHerdrAgent('w1:p1', 'go')
    await mini.getHerdrCommands('claude', 'w1:p1')
    await mini.getHerdrChat('w1:p1')
    await mini.getHerdrSubagent('w1:p1', 'tool-1')
    await mini.getHerdrWorkspaces()
    await mini.getHerdrSetup()

    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      `/api/herdr/computers/${MINI}/info`,
      `/api/herdr/computers/${MINI}/mutes`,
      `/api/herdr/computers/${MINI}/mutes`,
      `/api/herdr/computers/${MINI}/rpc`,
      `/api/herdr/computers/${MINI}/commands?agent=claude&pane=w1%3Ap1`,
      `/api/herdr/computers/${MINI}/chat?pane=w1%3Ap1&before=-1&limit=60`,
      `/api/herdr/computers/${MINI}/subagent?pane=w1%3Ap1&tool=tool-1`,
      `/api/herdr/computers/${MINI}/workspaces`,
      `/api/herdr/computers/${MINI}/setup`,
    ])
  })

  it('keeps the desktop paths when no computer is chosen', async () => {
    const { api, fetch } = desktop()
    expect(api.forHerdrComputer(undefined)).toBe(api)
    await api.forHerdrComputer(undefined).getHerdrInfo()
    expect(fetch).toHaveBeenCalledWith('/api/herdr/info', expect.anything())
  })

  it('reuses one API per computer and switches back to the desktop', () => {
    const { api } = desktop()
    const mini = api.forHerdrComputer(MINI)
    expect(api.forHerdrComputer(MINI)).toBe(mini)
    expect(mini.forHerdrComputer(MINI)).toBe(mini)
    expect(mini.herdrComputer).toBe(MINI)
    expect(api.herdrComputer).toBeUndefined()
  })

  it('refuses ids the desktop route would not match', () => {
    const { api } = desktop()
    expect(() => api.forHerdrComputer('../settings')).toThrow(/computer id/)
    expect(() => api.forHerdrComputer('0123456789ABCDEF')).toThrow()
  })

  it('never opens a Herdr socket for a remote computer', () => {
    const openWebSocket = vi.fn()
    const api = new AlmaApi({ fetch: vi.fn(), openWebSocket } as never)
    const mini = api.forHerdrComputer(MINI)
    for (const path of [
      '/ws/herdr',
      '/ws/herdr/chat?pane=p&from=0',
      '/ws/herdr/screen?pane=p',
    ])
      expect(() => mini.openJsonSocket(path, vi.fn())).toThrow(/live socket/)
    expect(openWebSocket).not.toHaveBeenCalled()
  })

  it('refuses remote uploads, which the proxy would deliver empty', async () => {
    const { api, fetch } = desktop()
    const mini = api.forHerdrComputer(MINI)
    expect(mini.herdrUploadsSupported).toBe(false)
    expect(api.herdrUploadsSupported).toBe(true)
    await expect(
      mini.herdrUpload(new Uint8Array([1]), 'image/png', 'a.png'),
    ).rejects.toThrow(/another computer/)
    await expect(
      mini.herdrUploadChunked(new Uint8Array([1]), 'image/png', 'a.png'),
    ).rejects.toThrow(/another computer/)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('asks the remote computer for its own transcript images', async () => {
    const { api, fetch } = desktop(
      vi.fn().mockResolvedValue(reply({}, 200, 'image/png')),
    )
    await api.forHerdrComputer(MINI).getImage('/api/herdr/image/shot.png')
    await api.getImage('/api/herdr/image/shot.png')
    expect(fetch.mock.calls.map(([path]) => path)).toEqual([
      `/api/herdr/computers/${MINI}/image/shot.png`,
      '/api/herdr/image/shot.png',
    ])
  })
})

describe('Herdr computers list', () => {
  it('parses the list from the desktop root even on a remote API', async () => {
    const { api, fetch } = desktop(
      vi.fn().mockResolvedValue(
        reply({
          computers: [
            { id: MINI, label: 'Studio', state: 'ready' },
            { id: 'not-hex', label: 'Bad' },
          ],
        }),
      ),
    )
    await expect(
      api.forHerdrComputer(MINI).listHerdrComputers(),
    ).resolves.toEqual({
      status: 'ok',
      computers: [{ id: MINI, label: 'Studio', state: 'ready' }],
    })
    expect(fetch).toHaveBeenCalledWith(
      '/api/herdr/computers',
      expect.anything(),
    )
  })

  it('reports an older desktop (404) as unsupported', async () => {
    const { api } = desktop(
      vi.fn().mockResolvedValue(reply({ error: 'Route not found' }, 404)),
    )
    await expect(api.listHerdrComputers()).resolves.toEqual({
      status: 'unsupported',
    })
  })

  it('reports a detached native shell (503) as unavailable', async () => {
    const { api } = desktop(
      vi
        .fn()
        .mockResolvedValue(
          reply({ error: { code: 'computers_unavailable' } }, 503),
        ),
    )
    await expect(api.listHerdrComputers()).resolves.toEqual({
      status: 'unavailable',
    })
  })
})

describe('Herdr setup API', () => {
  it('reads the setup state', async () => {
    const { api } = desktop(
      vi.fn().mockResolvedValue(reply({ online: false, phase: 'missing' })),
    )
    await expect(api.getHerdrSetup()).resolves.toEqual({
      online: false,
      phase: 'missing',
    })
  })

  it('posts install and start and reads failures from the 502 body', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply({ online: true, phase: 'starting' }))
      .mockResolvedValueOnce(
        reply({ online: false, phase: 'stopped', error: 'port in use' }, 502),
      )
    const { api } = desktop(fetch)
    await expect(api.runHerdrSetup('install')).resolves.toEqual({
      status: 'done',
      setup: { online: true, phase: 'starting' },
    })
    await expect(api.runHerdrSetup('start')).resolves.toEqual({
      status: 'failed',
      setup: { online: false, phase: 'stopped', error: 'port in use' },
    })
    expect(fetch.mock.calls.map(([path, init]) => [path, init.method])).toEqual(
      [
        ['/api/herdr/setup/install', 'POST'],
        ['/api/herdr/setup/start', 'POST'],
      ],
    )
  })

  it('treats a proxy timeout as still running and 400 as unsupported', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply({ error: 'timeout' }, 504))
      .mockResolvedValueOnce(reply({ error: { code: 'unsupported' } }, 400))
    const { api } = desktop(fetch)
    const mini = api.forHerdrComputer(MINI)
    await expect(mini.runHerdrSetup('install')).resolves.toEqual({
      status: 'pending',
    })
    await expect(mini.runHerdrSetup('start')).resolves.toEqual({
      status: 'unsupported',
    })
    expect(fetch.mock.calls[0][0]).toBe(
      `/api/herdr/computers/${MINI}/setup/install`,
    )
  })
})

describe('desktop default Herdr agent', () => {
  it('follows the coding agent setting through the provider list', async () => {
    const fetch = vi.fn(async (path: string) =>
      path === '/api/settings'
        ? reply({ chat: { coderAgentProviderId: 'codex-acp' } })
        : reply([
            { id: 'codex-acp', type: 'acp', acpCommand: 'codex-acp' },
            { id: 'anthropic', type: 'anthropic' },
          ]),
    )
    const { api } = desktop(fetch as never)
    await expect(api.getDefaultHerdrAgent()).resolves.toBe('codex')
  })

  it('keeps the phone default when the settings cannot be read', async () => {
    const { api } = desktop(vi.fn().mockResolvedValue(reply({}, 500)))
    await expect(api.getDefaultHerdrAgent()).resolves.toBeUndefined()
  })

  it("doesn't apply this desktop's setting to another computer", async () => {
    const { api, fetch } = desktop()
    await expect(
      api.forHerdrComputer(MINI).getDefaultHerdrAgent(),
    ).resolves.toBeUndefined()
    expect(fetch).not.toHaveBeenCalled()
  })
})
