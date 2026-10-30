// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { type ReactNode } from 'react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  UpdateProvider,
  type UpdateDependencies,
} from '../updates/UpdateProvider'
import { UpdateSettings } from './UpdateSettings'

const apk = {
  name: 'alma-android-v0.1.3.apk',
  url: 'https://github.com/lazyeo/alma-android/releases/download/v0.1.3/alma-android-v0.1.3.apk',
  checksumUrl:
    'https://github.com/lazyeo/alma-android/releases/download/v0.1.3/alma-android-v0.1.3.apk.sha256',
  size: 1024,
}

function deps(overrides: Partial<UpdateDependencies> = {}): UpdateDependencies {
  return {
    loadRuntime: vi.fn().mockResolvedValue({
      platform: 'android',
      packageId: 'club.a_dobe.alma',
      versionName: '0.1.2',
      sha: 'abcdef0',
    }),
    fetchLatest: vi.fn().mockResolvedValue({
      version: '0.1.3',
      notes: '## Highlights\n\n- Safer updates',
      pageUrl: 'https://github.com/lazyeo/alma-android/releases/tag/v0.1.3',
      apk,
    }),
    download: vi.fn().mockImplementation(async (_version, _apk, progress) => {
      progress(0.5)
      await new Promise(() => undefined)
    }),
    cancel: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue('started'),
    openUrl: vi.fn(),
    now: () => 1_000_000,
    ...overrides,
  }
}

const wrapper = (dependencies: UpdateDependencies) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <UpdateProvider dependencies={dependencies}>{children}</UpdateProvider>
    )
  }

describe('UpdateSettings', () => {
  beforeAll(() => {
    const values = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        setItem: (key: string, value: string) => values.set(key, value),
        clear: () => values.clear(),
      },
    })
  })
  beforeEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('shows version, release notes, actions and download progress', async () => {
    const dependencies = deps()
    render(<UpdateSettings />, { wrapper: wrapper(dependencies) })

    expect(await screen.findByText('0.1.2 (abcdef0)')).toBeTruthy()
    expect(await screen.findByText('New version 0.1.3')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Highlights' })).toBeTruthy()
    expect(screen.getByText('Safer updates')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Install update' }))
    expect(await screen.findByText('50%')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Cancel download' })).toBeTruthy()
    expect(
      screen.getByRole('button', { name: 'Download in browser' }),
    ).toBeTruthy()
  })

  it('is absent for private builds', async () => {
    const dependencies = deps({
      loadRuntime: vi.fn().mockResolvedValue({
        platform: 'android',
        packageId: 'club.a_dobe.alma.private',
        versionName: '0.1.2-private',
      }),
    })
    const { container } = render(<UpdateSettings />, {
      wrapper: wrapper(dependencies),
    })
    await waitFor(() => expect(dependencies.loadRuntime).toHaveBeenCalled())
    await waitFor(() => expect(container.childElementCount).toBe(0))
  })
})
