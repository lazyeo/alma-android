type SiteIconFetcher = (url: string) => Promise<string | null>

const icons = new Map<string, string | null>()
const pending = new Map<string, Promise<string | null>>()

function cacheKey(url: string) {
  return new URL(url).origin
}

export function getCachedSiteIcon(
  url: string,
  fetchIcon: SiteIconFetcher,
): Promise<string | null> {
  const key = cacheKey(url)
  if (icons.has(key)) return Promise.resolve(icons.get(key) ?? null)
  const existing = pending.get(key)
  if (existing) return existing

  const request = fetchIcon(url)
    .catch(() => null)
    .then((icon) => {
      icons.set(key, icon)
      pending.delete(key)
      return icon
    })
  pending.set(key, request)
  return request
}

export function clearSiteIconCache() {
  icons.clear()
  pending.clear()
}
