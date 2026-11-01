// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'

const { capabilities, angleSource } = vi.hoisted(() => ({
  capabilities: vi.fn(),
  angleSource: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../nativeBridge', () => ({
  configureNativeFoldTransition: vi.fn().mockResolvedValue(false),
  getNativeFoldAngleSource: angleSource,
  getNativeFoldCapabilities: capabilities,
  previewNativeFoldTransition: vi.fn().mockResolvedValue(false),
  requestNativeShizukuPermission: vi.fn().mockResolvedValue(undefined),
}))

import { FoldTransitionSettings } from './SettingsScreen'

function renderFoldSettings() {
  return render(
    <LanguageProvider>
      <FoldTransitionSettings />
    </LanguageProvider>,
  )
}

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
