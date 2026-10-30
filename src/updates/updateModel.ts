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

/** The only package id that receives public release APKs. */
export const PUBLIC_PACKAGE_ID = 'club.a_dobe.alma'

export type UpdateEligibility = 'native' | 'web' | 'hidden'

/**
 * Builds with another application id or a suffixed versionName (the
 * `almaApplicationId` / `almaVersionSuffix` Gradle properties) are not the
 * public app: a public APK would not install over them, so the updater is
 * hidden. The web build can check and link to the release, never install.
 */
export function updateEligibility(runtime: {
  platform: string
  packageId?: string
  versionName?: string
}): UpdateEligibility {
  if (runtime.platform === 'web') return 'web'
  return runtime.platform === 'android' &&
    runtime.packageId === PUBLIC_PACKAGE_ID &&
    isStableVersion(runtime.versionName ?? '')
    ? 'native'
    : 'hidden'
}

/** Splits the `<version> <sha>` value Vite embeds as __ALMA_BUILD__. */
export function parseBuildInfo(buildInfo: string) {
  const [version = '', sha] = buildInfo.trim().split(/\s+/)
  return sha ? { version, sha } : { version }
}

export const AUTO_CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
export const UPDATE_PREFS_KEY = 'alma-updates-v1'

export type UpdatePrefs = {
  autoCheck: boolean
  lastCheckedAt?: number
  /** Dismissed release; a later version is offered again. */
  skippedVersion?: string
  /** Last release seen, so the badge survives restarts between checks. */
  latest?: AvailableRelease
}

function storedRelease(value: unknown): AvailableRelease | undefined {
  const release = record(value)
  const version = release?.version
  if (typeof version !== 'string' || !isStableVersion(version)) return undefined
  if (
    typeof release?.notes !== 'string' ||
    release.pageUrl !== `${RELEASES_PAGE_URL}/tag/v${version}`
  )
    return undefined
  const name = apkAssetName(version)
  const url = `${RELEASE_DOWNLOADS}v${version}/${name}`
  const apk = record(release.apk)
  const validApk =
    apk?.name === name &&
    apk.url === url &&
    apk.checksumUrl === `${url}.sha256` &&
    typeof apk.size === 'number'
  return {
    version,
    notes: release.notes,
    pageUrl: release.pageUrl,
    ...(typeof release.publishedAt === 'string'
      ? { publishedAt: release.publishedAt }
      : {}),
    ...(validApk
      ? {
          apk: {
            name,
            url,
            size: apk.size as number,
            checksumUrl: `${url}.sha256`,
          },
        }
      : {}),
  }
}

export function loadUpdatePrefs(storage: Pick<Storage, 'getItem'>) {
  let stored: Record<string, unknown> | undefined
  try {
    stored = record(JSON.parse(storage.getItem(UPDATE_PREFS_KEY) ?? 'null'))
  } catch {
    stored = undefined
  }
  const prefs: UpdatePrefs = {
    autoCheck: typeof stored?.autoCheck === 'boolean' ? stored.autoCheck : true,
  }
  if (typeof stored?.lastCheckedAt === 'number')
    prefs.lastCheckedAt = stored.lastCheckedAt
  if (
    typeof stored?.skippedVersion === 'string' &&
    isStableVersion(stored.skippedVersion)
  )
    prefs.skippedVersion = stored.skippedVersion
  const latest = storedRelease(stored?.latest)
  if (latest) prefs.latest = latest
  return prefs
}

export function saveUpdatePrefs(
  storage: Pick<Storage, 'setItem'>,
  prefs: UpdatePrefs,
) {
  storage.setItem(UPDATE_PREFS_KEY, JSON.stringify(prefs))
}

export function shouldAutoCheck(
  eligibility: UpdateEligibility,
  prefs: UpdatePrefs,
  now: number,
) {
  if (eligibility === 'hidden' || !prefs.autoCheck) return false
  const last = prefs.lastCheckedAt
  return (
    last === undefined || last > now || now - last >= AUTO_CHECK_INTERVAL_MS
  )
}

export function isNewerRelease(
  release: AvailableRelease | undefined,
  currentVersion: string,
): release is AvailableRelease {
  return Boolean(
    release && (compareSemVer(release.version, currentVersion) ?? 0) > 0,
  )
}

/** The quiet Settings dot: a newer release the user has not dismissed. */
export function showUpdateBadge(
  eligibility: UpdateEligibility,
  prefs: UpdatePrefs,
  currentVersion: string,
) {
  return (
    eligibility !== 'hidden' &&
    isNewerRelease(prefs.latest, currentVersion) &&
    prefs.latest.version !== prefs.skippedVersion
  )
}

export type UpdateErrorKind = 'offline' | 'rateLimited' | 'timeout' | 'general'

export function updateErrorKind(failure: {
  online: boolean
  status?: number
  timedOut?: boolean
}): UpdateErrorKind {
  if (!failure.online) return 'offline'
  if (failure.timedOut) return 'timeout'
  // Unauthenticated GitHub API calls answer 403 (or 429) once rate limited.
  if (failure.status === 403 || failure.status === 429) return 'rateLimited'
  return 'general'
}
