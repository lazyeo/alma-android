// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  registerMascotRig,
  registeredMascotRig,
} from '../../extensions/mascotRig'
import {
  officialMascotAssets,
  registerOfficialMascot,
  useOfficialMascot,
} from './officialMascot'

const rig = {
  size: [512, 512],
  eyes: {
    L: { x: 1, y: 2, w: 76, h: 73, iris: [3, 4, 5, 6], lashY: 7 },
    R: { x: 8, y: 9, w: 70, h: 74, iris: [10, 11, 12, 13], lashY: 14 },
  },
  mouth: { cx: 255, cy: 318, w: 12 },
}

const respond = (body: unknown, ok = true) =>
  vi.fn(async () => ({ ok, json: async () => body }) as unknown as Response)

afterEach(() => registerMascotRig(undefined))

describe('officialMascotAssets', () => {
  it('wears the vector glasses', () => {
    expect(officialMascotAssets('/', rig as never).accessories).toEqual([
      'glasses',
    ])
  })

  it('points every layer at the bundled directory', () => {
    const assets = officialMascotAssets('/', rig as never)
    expect(assets.base).toBe('/alma-mascot/base.png')
    expect(assets.eyes.R).toEqual({
      white: '/alma-mascot/eye-R-white.png',
      iris: '/alma-mascot/eye-R-iris.png',
      lid: '/alma-mascot/eye-R-lid.png',
    })
    expect(officialMascotAssets('/app', rig as never).base).toBe(
      '/app/alma-mascot/base.png',
    )
  })
})

describe('registerOfficialMascot', () => {
  it('registers the rig the build bundled', async () => {
    const fetcher = respond(rig)
    await expect(registerOfficialMascot('/', fetcher)).resolves.toBe(true)
    expect(fetcher).toHaveBeenCalledWith('/alma-mascot/rig.json')
    expect(registeredMascotRig()?.rig).toEqual(rig)
  })

  it('keeps the vector face when the build has no rig', async () => {
    await expect(registerOfficialMascot('/', respond({}, false))).resolves.toBe(
      false,
    )
    await expect(
      registerOfficialMascot('/', respond({ size: [1, 1] })),
    ).resolves.toBe(false)
    await expect(
      registerOfficialMascot(
        '/',
        vi.fn(async () => {
          throw new Error('offline')
        }),
      ),
    ).resolves.toBe(false)
    expect(registeredMascotRig()).toBeUndefined()
  })
})

describe('useOfficialMascot', () => {
  it('is true only while the official art is registered', async () => {
    const { result, rerender } = renderHook(() => useOfficialMascot())
    expect(result.current).toBe(false)
    await registerOfficialMascot('/', respond(rig))
    rerender()
    expect(result.current).toBe(true)
    registerMascotRig({
      ...officialMascotAssets('/', rig as never),
      base: '/other/base.png',
    })
    rerender()
    expect(result.current).toBe(false)
  })
})
