// Pure rules for the in-app update check. Network, storage and native calls
// live in their callers so every decision here is unit-tested.

export type SemVer = {
  major: number
  minor: number
  patch: number
  prerelease: (string | number)[]
}

const numeric = '0|[1-9]\\d*'
const identifier = '[0-9A-Za-z-]+'
const SEMVER = new RegExp(
  `^v?(${numeric})\\.(${numeric})\\.(${numeric})` +
    `(?:-(${identifier}(?:\\.${identifier})*))?` +
    `(?:\\+${identifier}(?:\\.${identifier})*)?$`,
)
const STABLE = new RegExp(`^(${numeric})\\.(${numeric})\\.(${numeric})$`)

export function parseSemVer(value: string): SemVer | undefined {
  const match = SEMVER.exec(value)
  if (!match) return undefined
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]
      ? match[4]
          .split('.')
          .map((part) => (/^\d+$/.test(part) ? Number(part) : part))
      : [],
  }
}

/** A public release version: bare X.Y.Z, no prerelease, build or private suffix. */
export function isStableVersion(value: string) {
  return STABLE.test(value)
}

function compareIdentifiers(a: string | number, b: string | number) {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  // SemVer: numeric identifiers always rank below alphanumeric ones.
  if (typeof a === 'number') return -1
  if (typeof b === 'number') return 1
  return a < b ? -1 : a > b ? 1 : 0
}

/** SemVer 2.0 precedence; undefined when either side is not SemVer. */
export function compareSemVer(a: string, b: string): number | undefined {
  const left = parseSemVer(a)
  const right = parseSemVer(b)
  if (!left || !right) return undefined
  const core =
    left.major - right.major ||
    left.minor - right.minor ||
    left.patch - right.patch
  if (core) return core
  // A version without a prerelease ranks above any prerelease of it.
  if (!left.prerelease.length || !right.prerelease.length)
    return right.prerelease.length - left.prerelease.length
  const length = Math.max(left.prerelease.length, right.prerelease.length)
  for (let index = 0; index < length; index += 1) {
    if (index >= left.prerelease.length) return -1
    if (index >= right.prerelease.length) return 1
    const order = compareIdentifiers(
      left.prerelease[index],
      right.prerelease[index],
    )
    if (order) return order
  }
  return 0
}

export const UPDATE_REPOSITORY = 'lazyeo/alma-android'
export const RELEASES_PAGE_URL = `https://github.com/${UPDATE_REPOSITORY}/releases`
const RELEASE_DOWNLOADS = `${RELEASES_PAGE_URL}/download/`

export type ReleaseApk = {
  name: string
  url: string
  size: number
  checksumUrl: string
}

export type AvailableRelease = {
  version: string
  notes: string
  pageUrl: string
  publishedAt?: string
  /** Present only when the exact APK and its checksum are both attached. */
  apk?: ReleaseApk
}

/** The file name scripts/release.mjs publishes for a version. */
export const apkAssetName = (version: string) => `alma-android-v${version}.apk`

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined

// Only this repository's download URL for this exact tag and file name.
function releaseAsset(assets: unknown[], tag: string, name: string) {
  const expected = `${RELEASE_DOWNLOADS}${tag}/${name}`
  for (const value of assets) {
    const asset = record(value)
    if (asset?.name === name && asset.browser_download_url === expected)
      return {
        url: expected,
        size: typeof asset.size === 'number' ? asset.size : 0,
      }
  }
  return undefined
}

/**
 * Reads GitHub's latest-release payload. Drafts, prereleases and tags other
 * than vX.Y.Z are not offered, even if the endpoint ever returned one.
 */
export function parseLatestRelease(
  payload: unknown,
): AvailableRelease | undefined {
  const release = record(payload)
  if (!release || release.draft !== false || release.prerelease !== false)
    return undefined
  const tag = release.tag_name
  if (typeof tag !== 'string' || !tag.startsWith('v')) return undefined
  const version = tag.slice(1)
  if (!isStableVersion(version)) return undefined
  const tagPage = `${RELEASES_PAGE_URL}/tag/${tag}`
  const html = release.html_url
  if (html !== undefined && html !== tagPage) return undefined

  const assets = Array.isArray(release.assets) ? release.assets : []
  const name = apkAssetName(version)
  const apk = releaseAsset(assets, tag, name)
  const checksum = releaseAsset(assets, tag, `${name}.sha256`)
  return {
    version,
    notes: typeof release.body === 'string' ? release.body : '',
    pageUrl: tagPage,
    ...(typeof release.published_at === 'string'
      ? { publishedAt: release.published_at }
      : {}),
    ...(apk && checksum
      ? {
          apk: {
            name,
            url: apk.url,
            size: apk.size,
            checksumUrl: checksum.url,
          },
        }
      : {}),
  }
}

/**
 * Reads a `sha256sum`-style file: one `<hex>  <name>` (or `*<name>`) line, or
 * a bare digest. A digest for any other file name is rejected.
 */
export function parseSha256File(text: string, fileName: string) {
  const lines = text.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length !== 1) return undefined
  const match = /^([0-9a-fA-F]{64})(?:\s+\*?(.+))?$/.exec(lines[0].trim())
  if (!match || (match[2] !== undefined && match[2].trim() !== fileName))
    return undefined
  return match[1].toLowerCase()
}
