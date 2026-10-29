import { describe, expect, it } from 'vitest'
import {
  splitSidebarSection,
  SPLIT_MIN_WIDTH,
  decideBack,
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

describe('back decision', () => {
  it('exits at tab roots in both layouts', () => {
    for (const mode of ['single', 'split'] as const) {
      expect(decideBack('/d/home/threads', true, mode)).toEqual({
        kind: 'exit',
      })
      expect(decideBack('/settings', true, mode)).toEqual({ kind: 'exit' })
    }
  })

  it('pops history from a single-pane thread', () => {
    expect(decideBack('/d/home/threads/t1', true, 'single')).toEqual({
      kind: 'pop',
    })
  })

  it('returns to the list for a cold-started single-pane thread', () => {
    expect(decideBack('/d/home/threads/t1', false, 'single')).toEqual({
      kind: 'navigate',
      to: '/d/home/threads',
    })
  })

  it('closes the detail pane instead of walking thread history in split mode', () => {
    expect(decideBack('/d/home/threads/t1', true, 'split')).toEqual({
      kind: 'navigate',
      to: '/d/home/threads',
    })
  })

  it('returns a GTD conversation to the GTD list, not Threads', () => {
    expect(decideBack('/d/home/gtd', true, 'single')).toEqual({ kind: 'exit' })
    expect(decideBack('/d/home/gtd/t1', true, 'single')).toEqual({
      kind: 'pop',
    })
    for (const [mode, canGoBack] of [
      ['single', false],
      ['split', true],
    ] as const)
      expect(decideBack('/d/home/gtd/t1', canGoBack, mode)).toEqual({
        kind: 'navigate',
        to: '/d/home/gtd',
      })
  })

  it('pops other screens when history exists, otherwise goes home', () => {
    expect(decideBack('/pair', true, 'split')).toEqual({ kind: 'pop' })
    expect(decideBack('/pair', false, 'single')).toEqual({
      kind: 'navigate',
      to: '/',
    })
  })
})
