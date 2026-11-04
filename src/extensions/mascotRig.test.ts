// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import {
  registerMascotRig,
  registeredMascotRig,
  useMascotRig,
  validMascotRig,
  type MascotRigAssets,
} from './mascotRig'

const eye = {
  x: 10,
  y: 20,
  w: 30,
  h: 28,
  iris: [25, 34, 6, 7] as [number, number, number, number],
  lashY: 26,
}
const assets: MascotRigAssets = {
  base: '/face/base.webp',
  eyes: {
    L: { white: '/l-w', iris: '/l-i', lid: '/l-l' },
    R: { white: '/r-w', iris: '/r-i', lid: '/r-l' },
  },
  rig: {
    size: [100, 100],
    eyes: { L: eye, R: { ...eye, x: 60 } },
    mouth: { cx: 50, cy: 70, w: 8 },
  },
}

afterEach(() => registerMascotRig(undefined))

describe('mascot rig extension point', () => {
  it('is empty until an extension registers a rig', () => {
    expect(registeredMascotRig()).toBeUndefined()
    registerMascotRig(assets)
    expect(registeredMascotRig()).toBe(assets)
  })

  it('notifies subscribers when a rig arrives late', () => {
    const { result } = renderHook(() => useMascotRig())
    expect(result.current).toBeUndefined()
    act(() => registerMascotRig(assets))
    expect(result.current).toBe(assets)
  })

  it('validates geometry before a renderer trusts it', () => {
    expect(validMascotRig(assets.rig)).toBe(true)
    expect(validMascotRig(undefined)).toBe(false)
    expect(validMascotRig({ ...assets.rig, size: [0, 100] })).toBe(false)
    expect(
      validMascotRig({
        ...assets.rig,
        eyes: { ...assets.rig.eyes, L: { ...eye, iris: [1, 2, 3] } },
      }),
    ).toBe(false)
    expect(
      validMascotRig({ ...assets.rig, mouth: { cx: 1, cy: Number.NaN, w: 2 } }),
    ).toBe(false)
  })
})
