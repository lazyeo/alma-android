// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

const values = new Map<string, string>()
const storage = {
  clear: () => values.clear(),
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
  removeItem: (key: string) => values.delete(key),
  key: (index: number) => [...values.keys()][index] ?? null,
  get length() {
    return values.size
  },
}
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: storage,
})
import type { AgentWorkspaceModel } from './model'
import {
  agentsViewModeStorageKey,
  buildWorkspaceSwitcher,
  loadAgentsViewMode,
  loadSelectedWorkspace,
  rememberLastViewedPane,
  resolveLastViewedPane,
  resolveSelectedWorkspace,
  saveAgentsViewMode,
  saveSelectedWorkspace,
  selectedWorkspaceStorageKey,
} from './agentsBoardModel'

const workspaces: AgentWorkspaceModel[] = [
  {
    id: 'quiet',
    label: 'Quiet',
    panes: [
      {
        id: 'idle',
        workspaceId: 'quiet',
        agent: 'claude',
        status: 'idle',
        title: 'Idle',
      },
    ],
  },
  {
    id: 'working',
    label: 'Working',
    panes: [
      {
        id: 'work-1',
        workspaceId: 'working',
        agent: 'codex',
        status: 'working',
        title: 'Work one',
      },
      {
        id: 'work-2',
        workspaceId: 'working',
        agent: 'claude',
        status: 'working',
        title: 'Work two',
      },
    ],
  },
  {
    id: 'blocked',
    label: 'Blocked',
    panes: [
      {
        id: 'blocked-1',
        workspaceId: 'blocked',
        agent: 'claude',
        status: 'blocked',
        title: 'Needs approval',
      },
      {
        id: 'blocked-work',
        workspaceId: 'blocked',
        agent: 'codex',
        status: 'working',
        title: 'Still working',
      },
    ],
  },
]

describe('Agents board workspace switcher', () => {
  beforeEach(() => localStorage.clear())

  it('orders blocked then working workspaces and reports live counts', () => {
    expect(buildWorkspaceSwitcher(workspaces)).toEqual([
      expect.objectContaining({ id: 'blocked', blocked: 1, working: 1 }),
      expect.objectContaining({ id: 'working', blocked: 0, working: 2 }),
      expect.objectContaining({ id: 'quiet', blocked: 0, working: 0 }),
    ])
  })

  it('keeps a persisted workspace when present and falls back when removed', () => {
    saveSelectedWorkspace('desk', 'working')
    expect(loadSelectedWorkspace('desk')).toBe('working')
    expect(resolveSelectedWorkspace(workspaces, 'working')).toBe('working')
    expect(resolveSelectedWorkspace(workspaces, 'removed')).toBe('blocked')
    expect(resolveSelectedWorkspace([], 'removed')).toBeUndefined()
    expect(localStorage.getItem(selectedWorkspaceStorageKey('desk'))).toBe(
      'working',
    )
  })
})

describe('Agents view mode persistence', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to board and stores list or board', () => {
    expect(loadAgentsViewMode()).toBe('board')
    saveAgentsViewMode('list')
    expect(loadAgentsViewMode()).toBe('list')
    expect(localStorage.getItem(agentsViewModeStorageKey)).toBe('list')
  })
})

describe('last viewed Agents pane', () => {
  beforeEach(() => localStorage.clear())

  it('uses a valid remembered pane, then the first blocked or working pane', () => {
    rememberLastViewedPane('desk', 'work-2')
    expect(resolveLastViewedPane('desk', workspaces)).toBe('work-2')

    rememberLastViewedPane('desk', 'removed')
    expect(resolveLastViewedPane('desk', workspaces)).toBe('blocked-1')
    expect(
      resolveLastViewedPane('desk', workspaces.slice(0, 1)),
    ).toBeUndefined()
  })
})
