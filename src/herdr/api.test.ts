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
    await api.chooseHerdrMenuOption('p1', '3')
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
          params: { pane_id: 'p1', keys: ['3'] },
        }),
      }),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      5,
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
      6,
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
