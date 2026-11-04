import { describe, expect, it, vi } from 'vitest'
import { AlmaHttpError } from '../relay'
import {
  ensurePersonalThread,
  personalThreadKey,
  resolvePersonalThread,
  type PersonalSetupApi,
  type PersonalSetupStorage,
} from './personalSetup'

const KEY = personalThreadKey('home')

function memoryStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  const storage: PersonalSetupStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  }
  return { storage, items }
}

function fakeApi({
  desktopThread = null as string | null,
  threads = [] as string[],
  personal = 'ok' as 'ok' | 'unsupported' | 'not-ready',
  createFails = false,
} = {}) {
  const known = new Set(threads)
  const api = {
    getPersonal: vi.fn(async () => {
      if (personal === 'not-ready')
        throw new AlmaHttpError('Personal agent is not ready', 503)
      if (personal === 'unsupported') return { status: 'unsupported' as const }
      return {
        status: 'ok' as const,
        personal: {
          threadId: desktopThread,
          today: { spentUsd: 0, budgetUsd: null, over: false },
          running: 0,
          pendingApprovals: 0,
        },
      }
    }),
    getThread: vi.fn(async (id: string) => {
      if (!known.has(id)) throw new AlmaHttpError('Thread not found', 404)
      return { id }
    }),
    listModels: vi.fn(async () => [
      {
        id: 'openai:gpt-5',
        name: 'GPT-5',
        capabilities: {
          reasoning: true,
          reasoningLevels: ['low', 'medium', 'high'],
        },
      },
      { id: 'anthropic:claude', name: 'Claude' },
    ]),
    getSettings: vi.fn(async () => ({
      chat: { defaultModel: 'openai:gpt-5' },
    })),
    createThread: vi.fn(async () => {
      if (createFails) throw new AlmaHttpError('Internal error', 500)
      known.add('created')
      return { id: 'created' }
    }),
    setPersonalMain: vi.fn(async (threadId: string) => ({ threadId })),
  }
  return api as typeof api & PersonalSetupApi
}

describe('resolvePersonalThread', () => {
  it('uses a cached thread that still exists and points the desktop at it', async () => {
    const api = fakeApi({ threads: ['cached'] })
    const { storage, items } = memoryStorage({ [KEY]: 'cached' })
    await expect(resolvePersonalThread(api, 'home', storage)).resolves.toEqual({
      status: 'ready',
      threadId: 'cached',
    })
    expect(api.createThread).not.toHaveBeenCalled()
    expect(api.setPersonalMain).toHaveBeenCalledWith('cached')
    expect(items.get(KEY)).toBe('cached')
  })

  it('clears a cached thread that is gone and creates a new one', async () => {
    const api = fakeApi()
    const { storage, items } = memoryStorage({ [KEY]: 'deleted' })
    await expect(resolvePersonalThread(api, 'home', storage)).resolves.toEqual({
      status: 'ready',
      threadId: 'created',
    })
    expect(api.getThread).toHaveBeenCalledWith('deleted')
    expect(api.setPersonalMain).toHaveBeenCalledWith('created')
    expect(items.get(KEY)).toBe('created')
  })

  it('adopts the desktop main thread without creating or sending it back', async () => {
    const api = fakeApi({ desktopThread: 'desk', threads: ['desk'] })
    const { storage, items } = memoryStorage()
    await expect(resolvePersonalThread(api, 'home', storage)).resolves.toEqual({
      status: 'ready',
      threadId: 'desk',
    })
    expect(api.createThread).not.toHaveBeenCalled()
    expect(api.setPersonalMain).not.toHaveBeenCalled()
    expect(items.get(KEY)).toBe('desk')
  })

  it('creates "Alma" with the composer defaults and makes it the main thread', async () => {
    const api = fakeApi()
    const { storage, items } = memoryStorage()
    await resolvePersonalThread(api, 'home', storage)
    expect(api.createThread).toHaveBeenCalledWith('Alma', undefined, {
      model: 'openai:gpt-5',
      reasoningEffort: 'medium',
    })
    expect(api.setPersonalMain).toHaveBeenCalledWith('created')
    expect(items.get(KEY)).toBe('created')
  })

  it('lets a valid, different desktop thread win over the cache', async () => {
    const api = fakeApi({ desktopThread: 'desk', threads: ['desk', 'mine'] })
    const { storage, items } = memoryStorage({ [KEY]: 'mine' })
    await expect(resolvePersonalThread(api, 'home', storage)).resolves.toEqual({
      status: 'ready',
      threadId: 'desk',
    })
    expect(api.setPersonalMain).not.toHaveBeenCalled()
    expect(items.get(KEY)).toBe('desk')
  })

  it('replaces a desktop main thread that is no longer reachable', async () => {
    const api = fakeApi({ desktopThread: 'gone', threads: ['mine'] })
    const { storage } = memoryStorage({ [KEY]: 'mine' })
    await expect(resolvePersonalThread(api, 'home', storage)).resolves.toEqual({
      status: 'ready',
      threadId: 'mine',
    })
    expect(api.setPersonalMain).toHaveBeenCalledWith('mine')
  })

  it('creates nothing on a desktop without /api/personal', async () => {
    const api = fakeApi({ personal: 'unsupported' })
    await expect(
      resolvePersonalThread(api, 'home', memoryStorage().storage),
    ).resolves.toEqual({ status: 'unsupported' })
    expect(api.createThread).not.toHaveBeenCalled()
    expect(api.setPersonalMain).not.toHaveBeenCalled()
  })

  it('fails on "not ready" and on a failed create, and a retry recovers', async () => {
    const notReady = fakeApi({ personal: 'not-ready' })
    await expect(
      resolvePersonalThread(notReady, 'home', memoryStorage().storage),
    ).rejects.toMatchObject({ status: 503 })
    expect(notReady.createThread).not.toHaveBeenCalled()

    const api = fakeApi({ createFails: true })
    const { storage, items } = memoryStorage()
    await expect(resolvePersonalThread(api, 'home', storage)).rejects.toThrow()
    expect(api.setPersonalMain).not.toHaveBeenCalled()
    expect(items.has(KEY)).toBe(false)
    api.createThread.mockResolvedValueOnce({ id: 'created' })
    api.getThread.mockResolvedValue({ id: 'created' })
    await expect(resolvePersonalThread(api, 'home', storage)).resolves.toEqual({
      status: 'ready',
      threadId: 'created',
    })
  })
})

describe('ensurePersonalThread', () => {
  it('runs one setup per desktop for overlapping calls', async () => {
    const api = fakeApi()
    const { storage } = memoryStorage()
    const [first, second] = await Promise.all([
      ensurePersonalThread(api, 'home', storage),
      ensurePersonalThread(api, 'home', storage),
    ])
    expect(first).toEqual(second)
    expect(api.createThread).toHaveBeenCalledTimes(1)
    expect(api.setPersonalMain).toHaveBeenCalledTimes(1)
    // Settled: the next call starts over and finds the cached thread.
    await ensurePersonalThread(api, 'home', storage)
    expect(api.createThread).toHaveBeenCalledTimes(1)
    expect(api.getPersonal).toHaveBeenCalledTimes(2)
  })
})
