import { describe, expect, it } from 'vitest'
import { camera, hash, orbitDots } from './loadingOrb'

describe('loading orb geometry', () => {
  it('is deterministic and bounded', () => {
    expect(hash(2, 5)).toBe(hash(2, 5))
    expect(hash(2, 5)).toBeGreaterThanOrEqual(0)
    expect(hash(2, 5)).toBeLessThan(1)
    const dots = orbitDots(20, 0.6)
    expect(dots).toHaveLength(39)
    expect(dots.every((dot) => Number.isFinite(dot.x + dot.y + dot.z))).toBe(
      true,
    )
  })

  it('projects the origin to the camera centre', () => {
    expect(camera(0.4, 0.3, 10, 11)(0, 0, 0)).toEqual([10, 11, 0])
  })
})
