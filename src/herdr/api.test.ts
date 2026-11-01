import { describe, expect, it, vi } from 'vitest'
import { AlmaApi } from '../relay/almaApi'

const response = (value: unknown) => ({
  status: 200,
  headers: {},
  bytes: async () => new Uint8Array(),
  text: async () => JSON.stringify(value),
  json: async <T>() => value as T,
})

describe('Herdr API', () => {
  it('sends exact prompt, menu, and blocked text request shapes', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(response({ result: { accepted: true } }))
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as never)

    await api.promptHerdrAgent('p1', 'Please continue')
    await api.sendHerdrPaneKeys('p1', ['esc', 'ctrl+c'])
    await api.sendHerdrPaneText('p1', '/models')
    await api.chooseHerdrMenuOption('p1', 1, 3)
    await api.chooseHerdrMenuOption('p1', undefined, 4)
    await api.sendHerdrBlockedText('p1', 'Please use the safe option')

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      '/api/herdr/rpc',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          method: 'agent.prompt',
          params: { target: 'p1', text: 'Please continue' },
        }),
      }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      '/api/herdr/rpc',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          method: 'pane.send_keys',
          params: { pane_id: 'p1', keys: ['esc', 'ctrl+c'] },
        }),
      }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      '/api/herdr/rpc',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          method: 'pane.send_text',
          params: { pane_id: 'p1', text: '/models' },
        }),
      }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      4,
      '/api/herdr/rpc',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          method: 'pane.send_keys',
          params: { pane_id: 'p1', keys: ['down', 'enter'] },
        }),
      }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      5,
      '/api/herdr/rpc',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          method: 'pane.send_keys',
          params: { pane_id: 'p1', keys: ['4'] },
        }),
      }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      6,
      '/api/herdr/rpc',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          method: 'pane.send_text',
          params: { pane_id: 'p1', text: 'Please use the safe option' },
        }),
      }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      7,
      '/api/herdr/rpc',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          method: 'pane.send_keys',
          params: { pane_id: 'p1', keys: ['enter'] },
        }),
      }),
    )
  })

  it('sends exact management RPC shapes and returns create responses', async () => {
    const fetch = vi.fn().mockResolvedValue(
      response({ result: { nested: { pane_id: 'pane-created' } } }),
    )
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as never)

    await api.herdrRenameTab('tab-1', 'Review')
    await api.herdrRenameWorkspace('workspace-1', 'Mobile')
    await api.herdrCloseTab('tab-1')
    await api.herdrCloseWorkspace('workspace-1')
    expect(await api.herdrCreateTab('workspace-1', '/repo')).toEqual({
      nested: { pane_id: 'pane-created' },
    })
    expect(await api.herdrCreateWorkspace('Release', '/repo')).toEqual({
      nested: { pane_id: 'pane-created' },
    })

    const calls = fetch.mock.calls.map(([, init]) =>
      JSON.parse(String((init as RequestInit).body)),
    )
    expect(calls).toEqual([
      { method: 'tab.rename', params: { tab_id: 'tab-1', label: 'Review' } },
      {
        method: 'workspace.rename',
        params: { workspace_id: 'workspace-1', label: 'Mobile' },
      },
      { method: 'tab.close', params: { tab_id: 'tab-1' } },
      { method: 'workspace.close', params: { workspace_id: 'workspace-1' } },
      {
        method: 'tab.create',
        params: { workspace_id: 'workspace-1', focus: false, cwd: '/repo' },
      },
      {
        method: 'workspace.create',
        params: { focus: false, label: 'Release', cwd: '/repo' },
      },
    ])
  })

  it('retries agent.start while the new pane shell is unavailable', async () => {
    vi.useFakeTimers()
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          error: {
            code: 'invalid_state',
            message: 'pane is not an available shell',
          },
        }),
      )
      .mockResolvedValueOnce(
        response({
          error: {
            code: 'invalid_state',
            message: 'not an available shell yet',
          },
        }),
      )
      .mockResolvedValueOnce(response({ result: { started: true } }))
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as never)

    const started = api.herdrStartAgent('pi', 'pane-created', () => 0x1234abcd)
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(started).resolves.toEqual({ started: true })
    expect(fetch).toHaveBeenCalledTimes(3)
    expect(
      fetch.mock.calls.map(([, init]) =>
        JSON.parse(String((init as RequestInit).body)),
      ),
    ).toEqual(
      Array.from({ length: 3 }, () => ({
        method: 'agent.start',
        params: {
          name: 'pi-1234abcd',
          kind: 'pi',
          pane_id: 'pane-created',
        },
      })),
    )
    vi.useRealTimers()
  })

  it('preserves the agent_blocked code for composer routing', async () => {
    const fetch = vi.fn().mockResolvedValue(
      response({
        error: { code: 'agent_blocked', message: 'Agent is blocked' },
      }),
    )
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as never)

    await expect(api.promptHerdrAgent('p1', 'continue')).rejects.toMatchObject({
      code: 'agent_blocked',
    })
  })
})
