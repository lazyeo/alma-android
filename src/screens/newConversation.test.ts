import { describe, expect, it, vi } from 'vitest'
import type { AlmaApi } from '../relay'
import {
  createNewConversation,
  loadNewConversationDefaults,
} from './newConversation'

const models = [
  {
    id: 'provider:model',
    modelId: 'model',
    name: 'Model',
    provider: 'Provider',
    providerId: 'provider',
    capabilities: {},
  },
]

function api() {
  return {
    listWorkspaces: vi.fn().mockResolvedValue([
      { id: 'workspace-1', name: 'Workspace' },
      { id: 'workspace-2', name: 'Other' },
    ]),
    listModels: vi.fn().mockResolvedValue(models),
    getSettings: vi.fn().mockResolvedValue({
      general: { defaultWorkspaceId: 'workspace-1' },
      chat: { defaultModel: 'provider:model' },
    }),
    createThread: vi.fn().mockResolvedValue({ id: 'thread-1' }),
    updateThread: vi.fn().mockResolvedValue({ id: 'thread-1' }),
  } as unknown as AlmaApi
}

describe('new conversation setup', () => {
  it('loads the same workspace, model and reasoning defaults for every entry point', async () => {
    const client = api()

    const defaults = await loadNewConversationDefaults(client)

    expect(defaults).toMatchObject({
      workspaceId: 'workspace-1',
      model: 'provider:model',
      effort: 'medium',
      fastMode: false,
    })
  })

  it('creates then configures the thread before pendingFirstSend navigation', async () => {
    const client = api()
    const defaults = await loadNewConversationDefaults(client)

    await expect(createNewConversation(client, defaults)).resolves.toBe(
      'thread-1',
    )
    expect(client.createThread).toHaveBeenCalledWith('New Chat', 'workspace-1')
    expect(client.updateThread).toHaveBeenCalledWith('thread-1', {
      workspaceId: 'workspace-1',
      model: 'provider:model',
      reasoningEffort: 'off',
      fastMode: false,
    })
    expect(
      vi.mocked(client.createThread).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(client.updateThread).mock.invocationCallOrder[0])
  })
})
