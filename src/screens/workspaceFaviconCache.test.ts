import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  getCachedWorkspaceFavicon,
  peekWorkspaceFavicon,
} from './workspaceFaviconCache'

const icon = 'data:image/png;base64,ws'
const desktop = (
  getWorkspaceFavicon: (id: string) => Promise<string | null>,
) => ({ getWorkspaceFavicon: vi.fn(getWorkspaceFavicon) })

afterEach(() => vi.restoreAllMocks())

describe('workspace favicon cache', () => {
  it('fetches a workspace once per round and remembers the answer, including no icon', async () => {
    const api = desktop(async (id) => (id === 'ws-app' ? icon : null))

    await expect(getCachedWorkspaceFavicon(api, 'ws-app', 'r1')).resolves.toBe(
      icon,
    )
    await expect(getCachedWorkspaceFavicon(api, 'ws-app', 'r1')).resolves.toBe(
      icon,
    )
    await expect(
      getCachedWorkspaceFavicon(api, 'ws-plain', 'r1'),
    ).resolves.toBeNull()
    await expect(
      getCachedWorkspaceFavicon(api, 'ws-plain', 'r1'),
    ).resolves.toBeNull()

    expect(api.getWorkspaceFavicon).toHaveBeenCalledTimes(2)
    expect(peekWorkspaceFavicon(api, 'ws-app')).toBe(icon)
    expect(peekWorkspaceFavicon(api, 'ws-plain')).toBeNull()
    expect(peekWorkspaceFavicon(api, 'ws-unknown')).toBeUndefined()
  })

  it('asks again in a new round, so an old desktop that updates shows its icon', async () => {
    const api = desktop(async () => null)

    await expect(
      getCachedWorkspaceFavicon(api, 'ws-app', 'r1'),
    ).resolves.toBeNull()
    api.getWorkspaceFavicon.mockResolvedValueOnce(icon)
    await expect(getCachedWorkspaceFavicon(api, 'ws-app', 'r2')).resolves.toBe(
      icon,
    )
    await expect(getCachedWorkspaceFavicon(api, 'ws-app', 'r2')).resolves.toBe(
      icon,
    )
    expect(api.getWorkspaceFavicon).toHaveBeenCalledTimes(2)
  })

  it('deduplicates concurrent requests for the same workspace', async () => {
    let resolveIcon: (value: string | null) => void = () => undefined
    const api = desktop(
      () =>
        new Promise<string | null>((resolve) => {
          resolveIcon = resolve
        }),
    )

    const first = getCachedWorkspaceFavicon(api, 'ws-app', 'r1')
    const second = getCachedWorkspaceFavicon(api, 'ws-app', 'r1')
    resolveIcon(icon)

    await expect(Promise.all([first, second])).resolves.toEqual([icon, icon])
    expect(api.getWorkspaceFavicon).toHaveBeenCalledOnce()
  })

  it('keeps each desktop separate because workspace ids are per desktop', async () => {
    const mac = desktop(async () => icon)
    const studio = desktop(async () => null)

    await expect(getCachedWorkspaceFavicon(mac, 'ws-app', 'r1')).resolves.toBe(
      icon,
    )
    await expect(
      getCachedWorkspaceFavicon(studio, 'ws-app', 'r1'),
    ).resolves.toBeNull()
    expect(studio.getWorkspaceFavicon).toHaveBeenCalledOnce()
  })

  it('reports a failure, keeps the last known icon and asks again instead of caching it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const api = desktop(async () => icon)
    const offline = new Error('relay offline')
    api.getWorkspaceFavicon.mockRejectedValueOnce(offline)

    await expect(
      getCachedWorkspaceFavicon(api, 'ws-app', 'r1'),
    ).resolves.toBeNull()
    expect(peekWorkspaceFavicon(api, 'ws-app')).toBeUndefined()
    expect(warn).toHaveBeenCalledWith('Workspace favicon unavailable', offline)
    await expect(getCachedWorkspaceFavicon(api, 'ws-app', 'r1')).resolves.toBe(
      icon,
    )

    api.getWorkspaceFavicon.mockRejectedValueOnce(offline)
    await expect(getCachedWorkspaceFavicon(api, 'ws-app', 'r2')).resolves.toBe(
      icon,
    )
    expect(api.getWorkspaceFavicon).toHaveBeenCalledTimes(3)
  })
})
