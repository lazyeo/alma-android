import { describe, expect, it } from 'vitest'
import {
  apkAssetName,
  compareSemVer,
  isStableVersion,
  parseLatestRelease,
  parseSemVer,
  parseSha256File,
} from './updateModel'

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

const download = 'https://github.com/lazyeo/alma-android/releases/download'
const digest = 'a'.repeat(64)

function release(overrides: Record<string, unknown> = {}) {
  return {
    tag_name: 'v0.1.3',
    name: 'v0.1.3',
    draft: false,
    prerelease: false,
    html_url: 'https://github.com/lazyeo/alma-android/releases/tag/v0.1.3',
    body: '### Added\n\n- In-app update check.',
    published_at: '2026-10-30T08:00:00Z',
    assets: [
      {
        name: 'alma-android-v0.1.3.apk.sha256',
        browser_download_url: `${download}/v0.1.3/alma-android-v0.1.3.apk.sha256`,
        size: 90,
      },
      {
        name: 'alma-android-v0.1.3-debug.apk',
        browser_download_url: `${download}/v0.1.3/alma-android-v0.1.3-debug.apk`,
        size: 1,
      },
      {
        name: 'alma-android-v0.1.3.apk',
        browser_download_url: `${download}/v0.1.3/alma-android-v0.1.3.apk`,
        size: 7_340_032,
      },
    ],
    ...overrides,
  }
}

describe('latest release payload', () => {
  it('names the APK exactly as the release helper publishes it', () => {
    expect(apkAssetName('0.1.3')).toBe('alma-android-v0.1.3.apk')
  })

  it('selects the exact APK and its matching checksum asset', () => {
    expect(parseLatestRelease(release())).toEqual({
      version: '0.1.3',
      notes: '### Added\n\n- In-app update check.',
      pageUrl: 'https://github.com/lazyeo/alma-android/releases/tag/v0.1.3',
      publishedAt: '2026-10-30T08:00:00Z',
      apk: {
        name: 'alma-android-v0.1.3.apk',
        url: `${download}/v0.1.3/alma-android-v0.1.3.apk`,
        size: 7_340_032,
        checksumUrl: `${download}/v0.1.3/alma-android-v0.1.3.apk.sha256`,
      },
    })
  })

  it('offers no APK unless both the APK and its checksum are attached', () => {
    const assets = release().assets
    expect(
      parseLatestRelease(
        release({ assets: assets.filter((a) => !a.name.endsWith('.sha256')) }),
      )?.apk,
    ).toBeUndefined()
    expect(
      parseLatestRelease(
        release({ assets: assets.filter((a) => a.size !== 7_340_032) }),
      )?.apk,
    ).toBeUndefined()
  })

  it('ignores assets hosted outside this repository release downloads', () => {
    const assets = release().assets.map((asset) => ({
      ...asset,
      browser_download_url: asset.browser_download_url.replace(
        'lazyeo/alma-android',
        'someone/else',
      ),
    }))
    expect(parseLatestRelease(release({ assets }))?.apk).toBeUndefined()
  })

  it('rejects drafts, prereleases and non-stable tags', () => {
    expect(parseLatestRelease(release({ draft: true }))).toBeUndefined()
    expect(parseLatestRelease(release({ prerelease: true }))).toBeUndefined()
    expect(
      parseLatestRelease(release({ tag_name: 'v0.1.3-beta.1' })),
    ).toBeUndefined()
    expect(parseLatestRelease(release({ tag_name: '0.1.3' }))).toBeUndefined()
    expect(parseLatestRelease(release({ tag_name: 'nightly' }))).toBeUndefined()
  })

  it('rejects malformed payloads and foreign release pages', () => {
    expect(parseLatestRelease(undefined)).toBeUndefined()
    expect(parseLatestRelease('v0.1.3')).toBeUndefined()
    expect(
      parseLatestRelease(release({ html_url: 'https://example.com/v0.1.3' })),
    ).toBeUndefined()
  })

  it('falls back to the releases page and empty notes when fields are missing', () => {
    const parsed = parseLatestRelease(
      release({ html_url: undefined, body: null, published_at: undefined }),
    )
    expect(parsed?.pageUrl).toBe(
      'https://github.com/lazyeo/alma-android/releases/tag/v0.1.3',
    )
    expect(parsed?.notes).toBe('')
    expect(parsed?.publishedAt).toBeUndefined()
  })
})

describe('checksum file', () => {
  const name = 'alma-android-v0.1.3.apk'

  it('reads the digest written by the release helper', () => {
    expect(parseSha256File(`${digest}  ${name}\n`, name)).toBe(digest)
  })

  it('accepts binary-mode markers, upper case and a bare digest', () => {
    expect(parseSha256File(`${digest.toUpperCase()} *${name}`, name)).toBe(
      digest,
    )
    expect(parseSha256File(`${digest}\r\n`, name)).toBe(digest)
  })

  it('rejects a digest for another file or a malformed digest', () => {
    expect(
      parseSha256File(`${digest}  alma-android-v0.1.2.apk`, name),
    ).toBeUndefined()
    expect(parseSha256File(`${'a'.repeat(63)}  ${name}`, name)).toBeUndefined()
    expect(parseSha256File(`${'g'.repeat(64)}  ${name}`, name)).toBeUndefined()
    expect(parseSha256File('', name)).toBeUndefined()
    expect(
      parseSha256File(`${digest}  ${name}\n${digest}  other.apk`, name),
    ).toBeUndefined()
  })
})
