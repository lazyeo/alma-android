// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'

const { capabilities, angleSource } = vi.hoisted(() => ({
  capabilities: vi.fn(),
  angleSource: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('./UpdateSettings', () => ({ UpdateSettings: () => null }))
vi.mock('../desktops/PlatformIcon', () => ({
  DesktopPlatformIcon: () => null,
}))

vi.mock('../handoff/HandoffProvider', () => ({
  useHandoff: () => ({
    notificationSettings: {
      approvals: true,
      questions: true,
      generationComplete: true,
      agentNeedsYou: true,
    },
    permission: 'granted',
    updateNotificationSettings: vi.fn(),
    requestNotificationPermission: vi.fn(),
  }),
}))

vi.mock('../nativeBridge', () => ({
  configureNativeFoldTransition: vi.fn().mockResolvedValue(false),
  getNativeFoldAngleSource: angleSource,
  getNativeFoldCapabilities: capabilities,
  previewNativeFoldTransition: vi.fn().mockResolvedValue(false),
  requestNativeShizukuPermission: vi.fn().mockResolvedValue(undefined),
}))

import { SettingsScreen, FoldTransitionSettings } from './SettingsScreen'
import { DesktopsContext, type DesktopsValue } from '../desktops/DesktopContext'
import { MemoryRouter } from 'react-router-dom'

function renderFoldSettings() {
  return render(
    <LanguageProvider>
      <FoldTransitionSettings />
    </LanguageProvider>,
  )
}

describe('SettingsScreen desktop connection details', () => {
  afterEach(cleanup)

  it('shows transport and latency on each online desktop row', () => {
    capabilities.mockResolvedValue({ foldable: false, reason: 'none' })
    const home = {
      id: 'home',
      name: 'Home',
      relayUrl: 'https://relay.example.test/path',
      connectCode: 'fixture-only',
      addedAt: 1,
      lastActiveAt: 1,
    }
    const studio = {
      ...home,
      id: 'studio',
      name: 'Studio',
      relayUrl: 'https://unused.example.test/path',
      connectCode: 'fixture-studio',
    }
    const desktops: DesktopsValue = {
      store: { pairings: [home, studio], activeId: 'home' },
      desktops: [
        {
          pairing: home,
          status: 'online',
          transport: 'relay',
          latency: { transport: 'relay', ms: 42, sampledAt: Date.now() },
          connection: {
            pairing: home,
            status: 'online',
            transport: 'relay',
            latency: { transport: 'relay', ms: 42, sampledAt: Date.now() },
            tunnel: {} as never,
            api: {} as never,
          },
        },
        {
          pairing: studio,
          status: 'online',
          transport: 'direct',
          latency: { transport: 'direct', ms: 58, sampledAt: Date.now() },
          connection: {
            pairing: studio,
            status: 'online',
            transport: 'direct',
            latency: { transport: 'direct', ms: 58, sampledAt: Date.now() },
            tunnel: {} as never,
            api: {} as never,
          },
        },
      ],
      activate: vi.fn(),
      rename: vi.fn(),
      setHidden: vi.fn(),
      remove: vi.fn(),
    }

    render(
      <LanguageProvider>
        <MemoryRouter>
          <DesktopsContext.Provider value={desktops}>
            <SettingsScreen />
          </DesktopsContext.Provider>
        </MemoryRouter>
      </LanguageProvider>,
    )

    expect(screen.getByText('Relay relay.example.test · 42 ms')).toBeTruthy()
    expect(screen.getByText('LAN direct · 58 ms')).toBeTruthy()
    expect(screen.queryByText('Connection')).toBeNull()
    expect(screen.queryByText('Latency')).toBeNull()
  })
})

describe('FoldTransitionSettings', () => {
  beforeEach(() => {
    capabilities.mockReset()
  })

  afterEach(cleanup)

  it('renders nothing while capabilities are pending or not foldable', async () => {
    let resolveCapabilities: (value: {
      foldable: boolean
      reason: string
    }) => void
    capabilities.mockReturnValue(
      new Promise((resolve) => {
        resolveCapabilities = resolve
      }),
    )
    const { container } = renderFoldSettings()
    expect(container.childElementCount).toBe(0)

    await act(async () => {
      resolveCapabilities!({ foldable: false, reason: 'none' })
    })
    expect(container.childElementCount).toBe(0)
  })

  it('includes the fold section on a foldable', async () => {
    capabilities.mockResolvedValue({ foldable: true, reason: 'hinge_sensor' })
    renderFoldSettings()
    expect(
      await screen.findByRole('heading', { name: 'Fold transition' }),
    ).toBeTruthy()
  })
})
