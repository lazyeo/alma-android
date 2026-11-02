// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '../i18n'
import type { AlmaApi } from '../relay/almaApi'
import { AgentsManageProvider, useAgentsManage } from './AgentsManage'
import { HerdrProvider } from './HerdrProvider'
import type { AgentPaneModel, AgentWorkspaceModel } from './model'

const pane: AgentPaneModel = {
  id: 'pane-1',
  workspaceId: 'workspace-1',
  tabId: 'tab-1',
  agent: 'claude',
  status: 'idle',
  title: 'Implementation',
  cwd: '/repo',
}
const workspace: AgentWorkspaceModel = {
  id: 'workspace-1',
  label: 'Mobile',
  panes: [pane],
}

function Harness({ action }: { action: 'pane' | 'workspace' | 'new-agent' }) {
  const manage = useAgentsManage()
  return (
    <button
      onClick={() => {
        if (action === 'pane') manage.openPane(pane)
        else if (action === 'workspace') manage.openWorkspace(workspace)
        else manage.openNewAgentTab(workspace)
      }}
    >
      Open actions
    </button>
  )
}

function renderManage(
  api: Partial<AlmaApi>,
  action: 'pane' | 'workspace' | 'new-agent',
) {
  const fullApi = {
    getHerdrInfo: vi.fn(async () => ({ online: true })),
    getHerdrMutes: vi.fn(async () => ({ workspaces: [] })),
    openJsonSocket: vi.fn(() => ({
      opened: Promise.resolve(),
      close: vi.fn(),
      onClose: vi.fn(),
    })),
    ...api,
  } as unknown as AlmaApi
  render(
    <LanguageProvider>
      <MemoryRouter>
        <HerdrProvider
          desktops={[
            { id: 'desktop', name: 'Mac', online: true, api: fullApi },
          ]}
          notificationSettings={{} as never}
        >
          <AgentsManageProvider desktopId="desktop">
            <Harness action={action} />
          </AgentsManageProvider>
        </HerdrProvider>
      </MemoryRouter>
    </LanguageProvider>,
  )
  return fullApi
}

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('Herdr management sheets', () => {
  it('renames a tab with the entered label', async () => {
    const api = renderManage(
      { herdrRenameTab: vi.fn(async () => undefined) },
      'pane',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Rename tab' }))
    fireEvent.change(screen.getByDisplayValue('Implementation'), {
      target: { value: 'Review' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() =>
      expect(api.herdrRenameTab).toHaveBeenCalledWith('tab-1', 'Review'),
    )
  })

  it('requires confirmation before closing a workspace', async () => {
    const api = renderManage(
      { herdrCloseWorkspace: vi.fn(async () => undefined) },
      'workspace',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close workspace' }))
    expect(api.herdrCloseWorkspace).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Close workspace' }))
    await waitFor(() =>
      expect(api.herdrCloseWorkspace).toHaveBeenCalledWith('workspace-1'),
    )
  })

  it('opens the agent kind picker directly for a workspace', () => {
    renderManage({}, 'new-agent')
    fireEvent.click(screen.getByRole('button', { name: 'Open actions' }))
    expect(screen.getByRole('heading', { name: 'New agent tab' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Claude' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Codex' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Pi' })).toBeTruthy()
  })

  it('creates a tab before starting the selected agent', async () => {
    const api = renderManage(
      {
        herdrCreateTab: vi.fn(async () => ({ pane_id: 'pane-new' })),
        herdrStartAgent: vi.fn(async () => undefined),
      },
      'workspace',
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open actions' }))
    fireEvent.click(screen.getByRole('button', { name: 'New agent tab' }))
    fireEvent.click(screen.getByRole('button', { name: 'Codex' }))
    await waitFor(() =>
      expect(api.herdrCreateTab).toHaveBeenCalledWith('workspace-1', '/repo'),
    )
    expect(api.herdrStartAgent).toHaveBeenCalledWith('codex', 'pane-new')
    expect(
      vi.mocked(api.herdrCreateTab).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(api.herdrStartAgent).mock.invocationCallOrder[0])
  })
})
