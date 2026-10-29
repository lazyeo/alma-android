import { describe, expect, it } from 'vitest'
import { parentRoute } from './parentRoute'

describe('parentRoute', () => {
  const home = '/d/desk/threads'

  it('uses list parents for phone detail routes', () => {
    expect(parentRoute('/d/desk/agents/pane', 'single')).toBe('/d/desk/agents')
    expect(parentRoute('/d/desk/threads/thread', 'single')).toBe(home)
    expect(parentRoute('/d/desk/gtd/thread', 'single')).toBe('/d/desk/gtd')
    expect(parentRoute('/d/desk/crystals/c1', 'single')).toBe(
      '/d/desk/crystals',
    )
    expect(parentRoute('/d/desk/references/ref', 'single')).toBe(
      '/d/desk/references',
    )
  })

  it('returns non-home phone tabs to Chat and exits from Chat', () => {
    expect(parentRoute('/d/desk/agents', 'single')).toBe(home)
    expect(parentRoute('/d/desk/gtd', 'single')).toBe(home)
    expect(parentRoute('/settings', 'single', home)).toBe(home)
    expect(parentRoute(home, 'single')).toBeNull()
  })

  it('treats split details as the same tab level and returns to Chat', () => {
    expect(parentRoute('/d/desk/agents/pane', 'split')).toBe(home)
    expect(parentRoute('/d/desk/gtd/thread', 'split')).toBe(home)
    expect(parentRoute('/d/desk/threads/thread', 'split')).toBeNull()
  })

  it('changes with the current layout after fold transitions', () => {
    expect(parentRoute('/d/desk/agents/pane', 'split')).toBe(home)
    expect(parentRoute('/d/desk/agents/pane', 'single')).toBe('/d/desk/agents')
  })

  it('uses an explicit same-desktop screen origin and otherwise Herdr root', () => {
    expect(parentRoute('/d/desk/screen', 'single', '/settings')).toBe(
      '/settings',
    )
    expect(parentRoute('/d/desk/screen', 'single', '/d/other/agents')).toBe(
      '/d/desk/agents',
    )
    expect(parentRoute('/d/desk/screen', 'split')).toBe(home)
  })
})
