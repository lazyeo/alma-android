import { expect, it } from 'vitest'
import { groupProjects, projectPathBasename } from './projectGroups'
import { filterThreadsByWorkspace } from './workspaceOptions'
it('groups eligible threads with counts and latest activity, including unassigned projects', () => {
  const threads = [
    { id: 'a', workspaceId: 'p', updatedAt: 100 },
    { id: 'b', workspaceId: 'p', updatedAt: '1970-01-01T00:00:00.200Z' },
    { id: 'c', createdAt: 300 },
    { id: 'hidden', workspaceId: 'p', isIncognito: true, updatedAt: 900 },
    { id: 'child', workspaceId: 'p', parentThreadId: 'a', updatedAt: 800 },
  ]
  expect(
    groupProjects(threads, [
      { id: 'p', name: 'Project', path: '/home/developer/code/project-app' },
    ]),
  ).toEqual([
    {
      id: 'p',
      name: 'Project',
      pathBasename: 'project-app',
      count: 2,
      latestActivity: 200,
    },
    {
      id: 'none',
      name: 'Uncategorized',
      pathBasename: 'Unassigned',
      count: 1,
      latestActivity: 300,
    },
  ])
  expect(
    filterThreadsByWorkspace(threads, 'none', [
      { id: 'p', name: 'Project' },
    ]).map((t) => t.id),
  ).toEqual(['c'])
  expect(filterThreadsByWorkspace(threads, 'all')).toEqual(threads)
})

it('merges missing and orphaned workspace ids into one final Uncategorized group', () => {
  const threads = [
    { id: 'known', workspaceId: 'p', updatedAt: 500 },
    { id: 'orphan-a', workspaceId: 'deleted-a', updatedAt: 400 },
    { id: 'orphan-b', workspaceId: 'deleted-b', updatedAt: 300 },
    { id: 'missing', updatedAt: 200 },
  ]
  expect(
    groupProjects(threads, [
      { id: 'p', name: 'Project', path: '/code/project' },
    ]),
  ).toEqual([
    {
      id: 'p',
      name: 'Project',
      pathBasename: 'project',
      count: 1,
      latestActivity: 500,
    },
    {
      id: 'none',
      name: 'Uncategorized',
      pathBasename: 'Unassigned',
      count: 3,
      latestActivity: 400,
    },
  ])
})

it('extracts a readable project path basename across slash styles', () => {
  expect(projectPathBasename('~/code/alma-mobile')).toBe('alma-mobile')
  expect(projectPathBasename('C:\\work\\marketing-site\\')).toBe(
    'marketing-site',
  )
  expect(projectPathBasename()).toBe('Project')
})
