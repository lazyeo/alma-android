import { afterEach, describe, expect, it } from 'vitest'

const values = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  },
})
import {
  effectiveComputer,
  loadSelectedComputer,
  remotePollDelay,
  saveSelectedComputer,
  snapshotFromWorkspaces,
} from './computers'
import { agentListFromSnapshot } from './model'

const MINI = '0123456789abcdef'
const computers = [{ id: MINI, label: 'Studio', state: 'ready' }]

afterEach(() => localStorage.clear())

describe('Herdr computer choice', () => {
  it('remembers the choice per paired desktop', () => {
    saveSelectedComputer('desk-a', MINI)
    expect(loadSelectedComputer('desk-a')).toBe(MINI)
    expect(loadSelectedComputer('desk-b')).toBeNull()
    saveSelectedComputer('desk-a', undefined)
    expect(loadSelectedComputer('desk-a')).toBeNull()
  })

  it('uses a remembered computer only while the desktop lists it', () => {
    expect(effectiveComputer(computers, MINI)).toBe(MINI)
    expect(effectiveComputer(computers, null)).toBeUndefined()
    expect(effectiveComputer([], MINI)).toBeUndefined()
    // Older desktop (no computers route): the desktop itself.
    expect(effectiveComputer(null, MINI)).toBeUndefined()
  })

  it('trusts the remembered computer until the list first loads', () => {
    expect(effectiveComputer(undefined, MINI)).toBe(MINI)
    expect(effectiveComputer(undefined, null)).toBeUndefined()
  })
})

describe('remote snapshot polling', () => {
  const workspaces = {
    workspaces: [
      {
        workspace_id: 'w2',
        label: 'alma-main',
        folder: '/repo',
        chats: [
          {
            pane_id: 'w2:p1',
            tab_id: 'w2:t1',
            tab: '1',
            agent: null,
            status: 'unknown',
            title: '',
            cwd: '/repo',
          },
          {
            pane_id: 'w2:p2',
            tab_id: 'w2:t2',
            tab: 'cookie fallback',
            agent: 'claude',
            status: 'working',
            title: 'Load the cookie file',
            cwd: '/repo',
          },
        ],
      },
    ],
  }

  it('rebuilds the agent list from the workspaces view', () => {
    const snapshot = snapshotFromWorkspaces(workspaces)
    expect(agentListFromSnapshot(snapshot)).toEqual([
      {
        id: 'w2',
        label: 'alma-main',
        panes: [
          expect.objectContaining({
            id: 'w2:p2',
            workspaceId: 'w2',
            tabId: 'w2:t2',
            agent: 'claude',
            status: 'working',
            title: 'Load the cookie file',
            cwd: '/repo',
          }),
        ],
      },
    ])
  })

  it('ignores malformed rows', () => {
    expect(
      snapshotFromWorkspaces({ workspaces: [null, { chats: [] }] }),
    ).toEqual({ workspaces: [], tabs: [], panes: [] })
    expect(snapshotFromWorkspaces('nope')).toEqual({
      workspaces: [],
      tabs: [],
      panes: [],
    })
  })

  it('polls every 2 s while an agent works and every 10 s otherwise', () => {
    const working = snapshotFromWorkspaces(workspaces)
    expect(remotePollDelay(working)).toBe(2_000)
    expect(
      remotePollDelay({
        panes: [{ pane_id: 'p', workspace_id: 'w', agent_status: 'idle' }],
      }),
    ).toBe(10_000)
    expect(remotePollDelay(undefined)).toBe(10_000)
  })
})
