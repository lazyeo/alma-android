import { describe, expect, it } from 'vitest'
import { alignSpinnerAnimations } from './ThreadListRow'

describe('alignSpinnerAnimations', () => {
  it('pins every cell animation to the timeline origin so spinners step together', () => {
    const animations = [
      { startTime: 1234 },
      { startTime: 987.5 },
      { startTime: null },
    ]
    const el = {
      getAnimations: (opts?: { subtree?: boolean }) => {
        expect(opts).toEqual({ subtree: true })
        return animations
      },
    } as unknown as Element
    expect(alignSpinnerAnimations(el)).toBe(3)
    expect(animations.map((a) => a.startTime)).toEqual([0, 0, 0])
  })

  it('is a no-op without the Web Animations API or element', () => {
    expect(alignSpinnerAnimations(null)).toBe(0)
    expect(alignSpinnerAnimations({} as Element)).toBe(0)
  })
})
