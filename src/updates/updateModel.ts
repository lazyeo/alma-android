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
