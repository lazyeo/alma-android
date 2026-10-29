import { describe, expect, it, vi } from 'vitest'
import { AlmaApi } from '../../relay/almaApi'
import { selectLocalWakeWorkspace } from './wakeDisplay'

const response = (value: unknown) => ({
  status: 200,
  headers: {},
  bytes: async () => new Uint8Array(),
  text: async () => JSON.stringify(value),
  json: async <T>() => value as T,
})

describe('wake display', () => {
  it('prefers the configured default local workspace, then the first local one', () => {
    const workspaces = [
      { id: 'remote', name: 'Remote', remoteHostId: 'host-1' },
      { id: 'local-a', name: 'Local A' },
      { id: 'local-b', name: 'Local B', remoteHostId: null },
    ]
    expect(selectLocalWakeWorkspace(workspaces, 'local-b')?.id).toBe('local-b')
    expect(selectLocalWakeWorkspace(workspaces, 'remote')?.id).toBe('local-a')
    expect(selectLocalWakeWorkspace([workspaces[0]], 'remote')).toBeUndefined()
  })

  it('posts the exact desktop exec request shape', async () => {
    const fetch = vi.fn().mockResolvedValue(response({ success: true }))
    const api = new AlmaApi({ fetch, openWebSocket: vi.fn() } as never)

    await api.wakeDisplay('local-a')

    expect(fetch).toHaveBeenCalledWith(
      '/api/terminal/exec',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          command: 'caffeinate -u -t 2',
          workspaceId: 'local-a',
        }),
      }),
    )
  })
})
