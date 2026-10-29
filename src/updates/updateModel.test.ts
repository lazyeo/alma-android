import { describe, expect, it } from 'vitest'
import { compareSemVer, isStableVersion, parseSemVer } from './updateModel'

describe('SemVer', () => {
  it('parses release tags with or without a leading v', () => {
    expect(parseSemVer('v0.1.10')).toEqual({
      major: 0,
      minor: 1,
      patch: 10,
      prerelease: [],
    })
    expect(parseSemVer('1.2.3-beta.2+build.7')).toEqual({
      major: 1,
      minor: 2,
      patch: 3,
      prerelease: ['beta', 2],
    })
  })

  it('rejects malformed versions', () => {
    for (const value of ['', '1.2', 'v1.2.3.4', '01.2.3', '1.2.x', 'latest'])
      expect(parseSemVer(value), value).toBeUndefined()
  })

  it('compares numeric components numerically', () => {
    expect(compareSemVer('0.1.10', '0.1.9')).toBeGreaterThan(0)
    expect(compareSemVer('v0.2.0', '0.1.99')).toBeGreaterThan(0)
    expect(compareSemVer('1.0.0', 'v1.0.0')).toBe(0)
    expect(compareSemVer('0.9.9', '1.0.0')).toBeLessThan(0)
  })

  it('ranks a prerelease below its release and orders identifiers', () => {
    expect(compareSemVer('0.1.3-beta.1', '0.1.3')).toBeLessThan(0)
    expect(compareSemVer('0.1.3-beta.1', '0.1.2')).toBeGreaterThan(0)
    expect(compareSemVer('0.1.3-beta.10', '0.1.3-beta.9')).toBeGreaterThan(0)
    expect(compareSemVer('0.1.3-alpha', '0.1.3-beta')).toBeLessThan(0)
    expect(compareSemVer('0.1.3-1', '0.1.3-alpha')).toBeLessThan(0)
    expect(compareSemVer('0.1.3-beta', '0.1.3-beta.1')).toBeLessThan(0)
    expect(compareSemVer('0.1.3+one', '0.1.3+two')).toBe(0)
  })

  it('returns undefined when either side is not SemVer', () => {
    expect(compareSemVer('dev', '0.1.0')).toBeUndefined()
  })

  it('treats only a bare X.Y.Z as a stable version', () => {
    expect(isStableVersion('0.1.2')).toBe(true)
    expect(isStableVersion('v0.1.2')).toBe(false)
    expect(isStableVersion('0.1.2-beta.1')).toBe(false)
    expect(isStableVersion('0.1.2+local')).toBe(false)
    expect(isStableVersion('0.1.2.private')).toBe(false)
    expect(isStableVersion('0.1.2-private')).toBe(false)
  })
})
