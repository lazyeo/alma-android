// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { type ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  UpdateProvider,
  useUpdates,
  type UpdateDependencies,
} from './UpdateProvider'
import { UPDATE_PREFS_KEY } from './updateModel'

const release = {
  version: '0.1.3',
  notes: '## Better updates',
  pageUrl: 'https://github.com/lazyeo/alma-android/releases/tag/v0.1.3',
}

function dependencies(
  overrides: Partial<UpdateDependencies> = {},
): UpdateDependencies {
  return {
    loadRuntime: vi.fn().mockResolvedValue({
      platform: 'android',
      packageId: 'club.a_dobe.alma',
      versionName: '0.1.2',
      sha: 'abcdef0',
    }),
    fetchLatest: vi.fn().mockResolvedValue(release),
    download: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue({ status: 'started' }),
    openUrl: vi.fn(),
    now: () => 1_000_000,
    ...overrides,
  }
}

const wrapper = (deps: UpdateDependencies) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <UpdateProvider dependencies={deps}>{children}</UpdateProvider>
  }

describe('UpdateProvider', () => {
  beforeAll(() => {
    const values = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        removeItem: (key: string) => values.delete(key),
        clear: () => values.clear(),
      },
    })
  })
  beforeEach(() => localStorage.clear())

  it('checks once on startup and quietly exposes a newer release badge', async () => {
    const deps = dependencies()
    const { result } = renderHook(useUpdates, { wrapper: wrapper(deps) })

    await waitFor(() => expect(result.current.ready).toBe(true))
    await waitFor(() => expect(result.current.badge).toBe(true))
    expect(deps.fetchLatest).toHaveBeenCalledTimes(1)
    expect(result.current.status).toBe('available')
    expect(result.current.release?.version).toBe('0.1.3')
  })

  it('persists the default-on toggle and skipped release', async () => {
    const deps = dependencies()
    const { result } = renderHook(useUpdates, { wrapper: wrapper(deps) })
    await waitFor(() => expect(result.current.badge).toBe(true))

    act(() => result.current.setAutoCheck(false))
    act(() => result.current.skip())

    expect(result.current.autoCheck).toBe(false)
    expect(result.current.badge).toBe(false)
    expect(JSON.parse(localStorage.getItem(UPDATE_PREFS_KEY) ?? '{}')).toMatchObject(
      { autoCheck: false, skippedVersion: '0.1.3' },
    )
  })

  it('does not check or expose update UI for a private build', async () => {
    const deps = dependencies({
      loadRuntime: vi.fn().mockResolvedValue({
        platform: 'android',
        packageId: 'club.a_dobe.alma.private',
        versionName: '0.1.2-private',
      }),
    })
    const { result } = renderHook(useUpdates, { wrapper: wrapper(deps) })

    await waitFor(() => expect(result.current.ready).toBe(true))
    expect(result.current.eligibility).toBe('hidden')
    expect(result.current.badge).toBe(false)
    expect(deps.fetchLatest).not.toHaveBeenCalled()
  })
})
