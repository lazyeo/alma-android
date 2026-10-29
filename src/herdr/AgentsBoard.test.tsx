// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { AgentPaneRow } from './AgentsBoard'

const api = {
  readHerdrPane: vi.fn(async () => ({
    read: {
      text: 'Run this command?\n  1. Yes, run command\n> 2. Yes, always allow\n  3. No, cancel',
    },
  })),
  chooseHerdrMenuOption: vi.fn(async () => undefined),
}

vi.mock('../desktops/DesktopContext', () => ({
  useConnection: () => ({ api }),
}))
vi.mock('../i18n', () => ({ useT: () => (key: string) => key }))
vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useParams: () => ({}) }
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AgentPaneRow blocked quick answer', () => {
  it('reads a blocked visible pane once and sends cursor-relative keys', async () => {
    render(
      <MemoryRouter>
        <AgentPaneRow
          desktopId="desktop"
          pane={{
            id: 'pane-1',
            workspaceId: 'workspace-1',
            agent: 'agy',
            status: 'blocked',
            title: 'Run command',
          }}
        />
      </MemoryRouter>,
    )

    await waitFor(() =>
      expect(screen.getByText('Run this command?')).toBeTruthy(),
    )
    expect(api.readHerdrPane).toHaveBeenCalledWith('pane-1', 'text', {
      source: 'visible',
    })
    fireEvent.click(screen.getByRole('button', { name: '3. No, cancel' }))
    expect(api.chooseHerdrMenuOption).toHaveBeenCalledWith('pane-1', 1, 3)
  })
})
