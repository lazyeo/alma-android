// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import { AgentsState } from './AgentsScreen'

const renderState = (
  state?: Omit<
    NonNullable<Parameters<typeof AgentsState>[0]['state']>,
    'mutedWorkspaces'
  >,
  retry = vi.fn(),
) => {
  render(
    <LanguageProvider>
      <MemoryRouter>
        <AgentsState
          state={state ? { ...state, mutedWorkspaces: [] } : undefined}
          onRetry={retry}
        />
      </MemoryRouter>
    </LanguageProvider>,
  )
  return retry
}

describe('Agents state', () => {
  it('shows connecting while Herdr info is unresolved', () => {
    renderState()
    expect(screen.getByText('Connecting to coding agents…')).toBeTruthy()
  })

  it('explains that an unsupported desktop must be updated', () => {
    renderState({ desktopOnline: true, supported: false, online: false })
    expect(
      screen.getByText('Update Alma on this desktop to use coding agents.'),
    ).toBeTruthy()
  })

  it('explains how to start unreachable Herdr and retries', () => {
    const retry = renderState({
      desktopOnline: true,
      supported: true,
      online: false,
      error: 'connection refused',
    })
    expect(
      screen.getByText('Start herdr on the Mac, then try again.'),
    ).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalledTimes(1)
  })

  it('reports when the desktop itself is offline', () => {
    renderState({ desktopOnline: false, supported: true, online: false })
    expect(screen.getByText('This desktop is offline.')).toBeTruthy()
  })
})
