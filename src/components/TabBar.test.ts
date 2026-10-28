import { describe, expect, it } from 'vitest'
import { shouldCompactTabBar, shouldShowTabLabel } from './TabBar'

describe('shouldCompactTabBar', () => {
  it('keeps full labels when their measured content fits', () => {
    expect(shouldCompactTabBar(320, 319)).toBe(false)
  })

  it('switches to icons and counts when full labels do not fit', () => {
    expect(shouldCompactTabBar(319, 320)).toBe(true)
  })

  it('never compacts tab rows without icons', () => {
    expect(shouldCompactTabBar(120, 320, false)).toBe(false)
  })

  it('forces icon-only tabs at the narrow sidebar breakpoint', () => {
    expect(shouldCompactTabBar(260, 220, true, 260)).toBe(true)
    expect(shouldCompactTabBar(261, 220, true, 260)).toBe(false)
  })
})

describe('shouldShowTabLabel', () => {
  it('shows only the selected GTD label in the normal phone row', () => {
    expect(shouldShowTabLabel('todo', 'todo', false, true)).toBe(true)
    expect(shouldShowTabLabel('inbox', 'todo', false, true)).toBe(false)
  })

  it('hides every label when the measured row is compact', () => {
    expect(shouldShowTabLabel('todo', 'todo', true, true)).toBe(false)
  })

  it('keeps ordinary tab labels visible', () => {
    expect(shouldShowTabLabel('threads', 'projects', false, false)).toBe(true)
  })
})
