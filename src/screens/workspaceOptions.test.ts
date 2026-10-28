import { describe, expect, it } from 'vitest'
import type { AlmaSettings, Thread, Workspace } from '../relay'
import {
  DEFAULT_WORKSPACE_ID,
  filterThreadsByWorkspace,
  filterWorkspaces,
  resolveDefaultWorkspaceId,
  workspaceName,
} from './workspaceOptions'

const workspaces: Workspace[] = [
  { id: 'alpha', name: 'Alpha' },
  { id: DEFAULT_WORKSPACE_ID, name: 'Default' },
]

describe('workspace options', () => {
  it('uses the configured default workspace when it exists', () => {
    const settings: AlmaSettings = {
      general: { defaultWorkspaceId: 'alpha' },
    }
    expect(resolveDefaultWorkspaceId(settings, workspaces)).toBe('alpha')
  })

  it('falls back to the desktop default workspace when the setting is absent', () => {
    expect(resolveDefaultWorkspaceId({}, workspaces)).toBe(DEFAULT_WORKSPACE_ID)
  })

  it('falls back to the first available workspace if the desktop default is missing', () => {
    expect(resolveDefaultWorkspaceId({}, [workspaces[0]])).toBe('alpha')
  })

  it('labels missing and orphaned workspace records as Uncategorized', () => {
    expect(workspaceName('missing', workspaces)).toBe('Uncategorized')
    expect(workspaceName(undefined, workspaces)).toBe('Uncategorized')
  })

  it('optionally filters threads by workspace, merging orphans with uncategorized', () => {
    const threads = [
      { id: '1', workspaceId: 'alpha' },
      { id: '2', workspaceId: DEFAULT_WORKSPACE_ID },
      { id: '3' },
      { id: '4', workspaceId: 'deleted' },
    ] as Thread[]
    expect(filterThreadsByWorkspace(threads, 'all', workspaces)).toEqual(
      threads,
    )
    expect(filterThreadsByWorkspace(threads, 'alpha', workspaces)).toEqual([
      threads[0],
    ])
    expect(filterThreadsByWorkspace(threads, 'none', workspaces)).toEqual([
      threads[2],
      threads[3],
    ])
  })
})

describe('filterWorkspaces', () => {
  const projects: Workspace[] = [
    { id: 'a', name: 'Alma Mobile', path: '/code/alma-mobile' },
    { id: 'b', name: 'Notes', path: '/docs/notes' },
  ]

  it('returns every project for a blank query', () => {
    expect(filterWorkspaces(projects, '  ')).toEqual(projects)
  })

  it('matches name or path case-insensitively', () => {
    expect(filterWorkspaces(projects, 'MOBILE').map((w) => w.id)).toEqual(['a'])
    expect(filterWorkspaces(projects, 'docs').map((w) => w.id)).toEqual(['b'])
  })
})
