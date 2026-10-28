import { describe, expect, it } from 'vitest'
import {
  desktopCrystalsPath,
  desktopGtdPath,
  desktopReferencesPath,
  desktopSectionPath,
  desktopThreadPath,
  desktopThreadsPath,
  desktopTimeCluesPath,
  isRootPath,
} from './desktopRoutes'
import { notificationDestination } from './nativeRuntime'

describe('desktop-scoped routes', () => {
  it('builds encoded desktop thread paths accepted by notification routing', () => {
    expect(desktopThreadsPath('home')).toBe('/d/home/threads')
    const path = desktopThreadPath('a/b', 'thread 1')
    expect(path).toBe('/d/a%2Fb/threads/thread%201')
    expect(notificationDestination(path)).toBe(path)
  })

  it('keeps the current desktop-scoped section while switching desktops', () => {
    expect(desktopTimeCluesPath('home')).toBe('/d/home/time-clues')
    expect(desktopReferencesPath('a/b')).toBe('/d/a%2Fb/references')
    expect(desktopSectionPath('next', '/d/current/crystals/cry-1')).toBe(
      '/d/next/crystals',
    )
    expect(desktopSectionPath('next', '/d/current/time-clues')).toBe(
      '/d/next/time-clues',
    )
    expect(desktopSectionPath('next', '/d/current/references/item')).toBe(
      '/d/next/references',
    )
    expect(desktopSectionPath('next', '/d/current/gtd/t-1')).toBe('/d/next/gtd')
    expect(desktopSectionPath('next', '/settings')).toBe('/d/next/threads')
  })

  it('treats tab roots, including scoped thread lists, as back-exit roots', () => {
    expect(isRootPath('/d/home/threads')).toBe(true)
    expect(isRootPath('/d/home/gtd')).toBe(true)
    expect(isRootPath('/d/home/gtd/t1')).toBe(false)
    expect(isRootPath('/inbox')).toBe(false)
    expect(isRootPath('/d/home/threads/t1')).toBe(false)
    expect(isRootPath('/pair')).toBe(false)
  })
})

describe('crystal routes', () => {
  it('builds encoded overview and detail paths', () => {
    expect(desktopCrystalsPath('home')).toBe('/d/home/crystals')
    expect(desktopCrystalsPath('home', 'cry 1')).toBe(
      '/d/home/crystals/cry%201',
    )
  })
})

describe('GTD routes', () => {
  it('builds encoded list and conversation paths', () => {
    expect(desktopGtdPath('home')).toBe('/d/home/gtd')
    expect(desktopGtdPath('a/b', 'thread 1')).toBe('/d/a%2Fb/gtd/thread%201')
  })
})
