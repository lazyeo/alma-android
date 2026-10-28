import { beforeEach, describe, expect, it } from 'vitest'
import type { AlmaSettings, MessageRow, Thread, Workspace } from './almaApi'
import {
  clearDesktopThreadCache,
  createThreadCache,
  initialThreadListState,
  loadPersistedThreadList,
  persistThreadList,
  type ThreadCacheStorage,
} from './threadCache'

const row = (id: string): MessageRow => ({
  id,
  threadId: 'thread',
  message: { id, role: 'user', parts: [{ type: 'text', text: id }] },
})

const thread = (id: string): Thread => ({ id, title: id })
const workspace = (id: string): Workspace => ({ id, name: id })

function memoryStorage(): ThreadCacheStorage & {
  values: Map<string, string>
} {
  const values = new Map<string, string>()
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  }
}

describe('thread cache', () => {
  it('evicts the least recently used thread after twenty entries', () => {
    const cache = createThreadCache(20)
    for (let index = 0; index < 20; index += 1)
      cache.setThread('desktop', `thread-${index}`, {
        rows: [row(`row-${index}`)],
        title: `Thread ${index}`,
        workspaceId: '',
        model: '',
        reasoningEffort: 'medium',
        fastMode: null,
        isGeneratingTitle: false,
      })

    expect(cache.getThread('desktop', 'thread-0')).toBeDefined()
    cache.setThread('desktop', 'thread-20', {
      rows: [row('row-20')],
      title: 'Thread 20',
      workspaceId: '',
      model: '',
      reasoningEffort: 'medium',
      fastMode: null,
      isGeneratingTitle: false,
    })

    expect(cache.getThread('desktop', 'thread-1')).toBeUndefined()
    expect(cache.getThread('desktop', 'thread-0')).toBeDefined()
  })

  it('isolates thread and list entries by desktop', () => {
    const cache = createThreadCache()
    cache.setThread('a', 'same', {
      rows: [row('a')],
      title: 'A',
      workspaceId: '',
      model: '',
      reasoningEffort: 'medium',
      fastMode: null,
      isGeneratingTitle: false,
    })
    cache.setThreadList('a', {
      threads: [thread('a')],
      workspaces: [workspace('a')],
      settings: { chat: { defaultModel: 'a' } },
    })

    expect(cache.getThread('b', 'same')).toBeUndefined()
    expect(cache.getThreadList('b')).toBeUndefined()
  })
})

describe('persisted thread list cache', () => {
  let storage: ReturnType<typeof memoryStorage>

  beforeEach(() => {
    storage = memoryStorage()
  })

  it('round trips threads and workspaces without settings', () => {
    persistThreadList(storage, 'desktop', [thread('one')], [workspace('work')])

    expect(loadPersistedThreadList(storage, 'desktop')).toEqual({
      threads: [thread('one')],
      workspaces: [workspace('work')],
    })
    expect([...storage.values.values()].join(' ')).not.toContain('defaultModel')
  })

  it('ignores corrupt and unknown versions', () => {
    storage.values.set('alma-mobile.thread-list.v1:desktop', '{bad')
    expect(loadPersistedThreadList(storage, 'desktop')).toBeUndefined()
    storage.values.set(
      'alma-mobile.thread-list.v1:desktop',
      JSON.stringify({ version: 2, threads: [], workspaces: [] }),
    )
    expect(loadPersistedThreadList(storage, 'desktop')).toBeUndefined()
  })

  it('clears memory and disk entries when a pairing is removed', () => {
    const cache = createThreadCache()
    const settings: AlmaSettings = { chat: { defaultModel: 'secret-model' } }
    cache.setThreadList('desktop', {
      threads: [thread('one')],
      workspaces: [],
      settings,
    })
    persistThreadList(storage, 'desktop', [thread('one')], [])

    clearDesktopThreadCache('desktop', storage, cache)

    expect(cache.getThreadList('desktop')).toBeUndefined()
    expect(loadPersistedThreadList(storage, 'desktop')).toBeUndefined()
  })
})

describe('screen cache seeds', () => {
  it('seeds a reopened thread with messages before refresh', () => {
    const cache = createThreadCache()
    cache.setThread('desktop', 'thread', {
      rows: [row('cached message')],
      title: 'Cached',
      workspaceId: 'work',
      model: 'model',
      reasoningEffort: 'high',
      fastMode: true,
      isGeneratingTitle: false,
    })

    expect(cache.getThread('desktop', 'thread')?.rows).toHaveLength(1)
  })

  it('seeds the list without a loading state', () => {
    const cache = createThreadCache()
    cache.setThreadList('desktop', {
      threads: [thread('cached thread')],
      workspaces: [],
      settings: {},
    })

    expect(
      initialThreadListState('desktop', memoryStorage(), cache),
    ).toMatchObject({
      threads: [{ id: 'cached thread' }],
      loading: false,
    })
  })
})
