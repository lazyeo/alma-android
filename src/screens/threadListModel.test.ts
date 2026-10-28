import { describe, expect, it } from 'vitest'
import type { Thread, Workspace } from '../relay'
import { filterProjects, filterThreadList } from './threadListModel'

const workspaces: Workspace[] = [
  { id: 'app', name: 'Alma Mobile', path: '/code/alma-mobile' },
  { id: 'site', name: 'Website', path: '/code/site' },
]
const threads: Thread[] = [
  { id: '1', title: 'Timeline polish', workspaceId: 'app', updatedAt: 30 },
  { id: '2', title: 'Launch copy', workspaceId: 'site', updatedAt: 20 },
  { id: '3', title: 'Hidden child', workspaceId: 'app', parentThreadId: '1' },
]

describe('thread list search', () => {
  it('matches threads by title or project name', () => {
    expect(
      filterThreadList(threads, workspaces, 'timeline').map((t) => t.id),
    ).toEqual(['1'])
    expect(
      filterThreadList(threads, workspaces, 'website').map((t) => t.id),
    ).toEqual(['2'])
  })

  it('filters projects by name, not the titles of their threads', () => {
    expect(
      filterProjects(threads, workspaces, 'alma').map((p) => p.id),
    ).toEqual(['app'])
    expect(
      filterProjects(threads, workspaces, 'launch').map((p) => p.id),
    ).toEqual([])
  })
})
