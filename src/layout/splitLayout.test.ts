import { describe, expect, it } from 'vitest'
import {
  splitSidebarSection,
  SPLIT_MIN_WIDTH,
  layoutModeForWidth,
  threadNavigationOptions,
  threadRouteMatch,
} from './splitLayout'

describe('split sidebar route decision', () => {
  it('uses Agents for both the root and pane routes', () => {
    expect(splitSidebarSection('/d/desk/agents')).toBe('agents')
    expect(splitSidebarSection('/d/desk/agents/pane')).toBe('agents')
    expect(splitSidebarSection('/d/desk/threads/thread')).toBe('threads')
    expect(splitSidebarSection('/d/desk/gtd/thread')).toBe('gtd')
  })
})

describe('layout mode', () => {
  it('switches to two panes at 720px', () => {
    expect(SPLIT_MIN_WIDTH).toBe(720)
    expect(layoutModeForWidth(412)).toBe('single')
    expect(layoutModeForWidth(719)).toBe('single')
    expect(layoutModeForWidth(720)).toBe('split')
    expect(layoutModeForWidth(900)).toBe('split')
  })
})

describe('thread route matching', () => {
  it('decodes desktop and thread ids', () => {
    expect(threadRouteMatch('/d/a%2Fb/threads/t%201')).toEqual({
      desktopId: 'a/b',
      section: 'threads',
      threadId: 't 1',
    })
    expect(threadRouteMatch('/d/home/threads')).toEqual({
      desktopId: 'home',
      section: 'threads',
    })
    expect(threadRouteMatch('/d/home/gtd/t%201')).toEqual({
      desktopId: 'home',
      section: 'gtd',
      threadId: 't 1',
    })
    expect(threadRouteMatch('/d/home/gtd')).toEqual({
      desktopId: 'home',
      section: 'gtd',
    })
    expect(threadRouteMatch('/inbox')).toBeUndefined()
  })
})

describe('thread navigation options', () => {
  it('pushes from a list root into a thread', () => {
    expect(
      threadNavigationOptions('/d/home/threads', '/d/home/threads/t-1'),
    ).toEqual({})
  })

  it('replaces one thread detail with another', () => {
    expect(
      threadNavigationOptions('/d/home/threads/t-1', '/d/home/threads/t-2'),
    ).toEqual({ replace: true })
  })

  it('replaces the same thread selection', () => {
    expect(
      threadNavigationOptions('/d/home/threads/t-1', '/d/home/threads/t-1'),
    ).toEqual({ replace: true })
  })

  it('replaces GTD thread switches', () => {
    expect(
      threadNavigationOptions('/d/home/gtd/t-1', '/d/home/gtd/t-2'),
    ).toEqual({ replace: true })
  })

  it('replaces section switches while a detail is open', () => {
    expect(
      threadNavigationOptions('/d/home/threads/t-1', '/d/home/gtd'),
    ).toEqual({ replace: true })
    expect(
      threadNavigationOptions('/d/home/gtd/t-1', '/d/home/threads/t-2'),
    ).toEqual({ replace: true })
  })
})
