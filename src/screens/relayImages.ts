import { AlmaApi, assertSafePath } from '../relay/almaApi'

export function desktopImagePath(value: string): string {
  const url = new URL(value, 'http://localhost:23001')
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.port !== '23001' ||
    url.protocol !== 'http:' ||
    url.username ||
    url.password ||
    !url.pathname.startsWith('/api/')
  )
    throw new Error('Unsupported image address')
  const path = url.pathname + url.search
  assertSafePath(path, 'GET')
  return path
}

/** Byte cache belongs to one desktop API; object URLs belong to mounted views. */
export class ImageCache {
  private entries = new Map<string, Blob>()
  constructor(
    private api: AlmaApi,
    private limit = 12,
  ) {}
  async get(value: string): Promise<Blob> {
    const path = desktopImagePath(value)
    const cached = this.entries.get(path)
    const blob = cached ?? (await this.api.getImage(path))
    this.entries.delete(path)
    // Bound both entry count and total retained bytes (24 MiB).
    if (blob.size <= 24 * 1024 * 1024) this.entries.set(path, blob)
    while (
      this.entries.size > this.limit ||
      [...this.entries.values()].reduce((n, b) => n + b.size, 0) >
        24 * 1024 * 1024
    )
      this.entries.delete(this.entries.keys().next().value!)
    return blob
  }
}
const caches = new WeakMap<AlmaApi, ImageCache>()
export function imageCache(api: AlmaApi) {
  let cache = caches.get(api)
  if (!cache) {
    cache = new ImageCache(api)
    caches.set(api, cache)
  }
  return cache
}
