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
import { AgentPaneRow, AgentsBoard, AgentsList } from './AgentsBoard'

const openPane = vi.fn()
const openWorkspace = vi.fn()
const openNewAgentTab = vi.fn()

const api = {
  readHerdrPane: vi.fn(async () => ({
    read: {
      text: 'Run this command?\n  1. Yes, run command\n> 2. Yes, always allow\n  3. No, cancel',
    },
  })),
  chooseHerdrMenuOption: vi.fn(async () => undefined),
  getHerdrChat: vi.fn(async (): Promise<unknown> => {
    throw new Error('older desktop')
  }),
}

vi.mock('./HerdrProvider', () => ({
  useHerdr: () => ({ apiFor: () => api }),
}))
vi.mock('./AgentsManage', () => ({
  useAgentsManage: () => ({ openPane, openWorkspace, openNewAgentTab }),
}))
vi.mock('../i18n', () => ({ useT: () => (key: string) => key }))
vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useParams: () => ({}) }
})

HTMLElement.prototype.scrollIntoView = vi.fn()

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const workspace = {
  id: 'workspace-1',
  label: 'Mobile',
  panes: [],
  blocked: 0,
  working: 0,
}

describe('workspace header actions', () => {
  it('opens board workspace management from the title and always shows actions', () => {
    render(
      <MemoryRouter>
        <AgentsBoard
          desktopId="desktop"
          workspaces={[workspace]}
          selectedWorkspaceId="workspace-1"
          mutedWorkspaces={[]}
          onSelectWorkspace={() => undefined}
          onSetWorkspaceMuted={() => undefined}
        />
      </MemoryRouter>,
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'agents.workspaceActions' })[0],
    )
    expect(openWorkspace).toHaveBeenCalledWith(workspace)
    expect(
      screen.getAllByRole('button', { name: 'agents.workspaceActions' }),
    ).toHaveLength(2)
  })

  it('opens the new-agent kind picker directly from the board header', () => {
    render(
      <MemoryRouter>
        <AgentsBoard
          desktopId="desktop"
          workspaces={[workspace]}
          selectedWorkspaceId="workspace-1"
          mutedWorkspaces={[]}
          onSelectWorkspace={() => undefined}
          onSetWorkspaceMuted={() => undefined}
        />
      </MemoryRouter>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'agents.newAgentTab' }))
    expect(openNewAgentTab).toHaveBeenCalledWith(workspace)
  })

  it('opens list workspace management from the title and new-agent action', () => {
    render(
      <MemoryRouter>
        <AgentsList
          desktopId="desktop"
          workspaces={[workspace]}
          mutedWorkspaces={[]}
          onSetWorkspaceMuted={() => undefined}
        />
      </MemoryRouter>,
    )

    const actions = screen.getAllByRole('button', {
      name: 'agents.workspaceActions',
    })
    fireEvent.click(actions[0])
    expect(openWorkspace).toHaveBeenCalledWith(workspace)
    expect(actions).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'agents.newAgentTab' }))
    expect(openNewAgentTab).toHaveBeenCalledWith(workspace)
  })
})

describe('AgentPaneRow blocked quick answer', () => {
  it('shows the session agent mark and mutes it when unselected', () => {
    const { container } = render(
      <MemoryRouter>
        <AgentPaneRow
          desktopId="desktop"
          pane={{
            id: 'pane-1',
            workspaceId: 'workspace-1',
            agent: 'codex',
            sessionAgent: 'claude',
            status: 'idle',
            title: 'Review changes',
          }}
        />
      </MemoryRouter>,
    )

    expect(container.querySelector('[data-agent-mark="claude"]')).toBeTruthy()
    expect(container.querySelector('.agent-mark.muted')).toBeTruthy()
  })

  it('shows a distinct task title as a secondary line', () => {
    const { container } = render(
      <MemoryRouter>
        <AgentPaneRow
          desktopId="desktop"
          pane={{
            id: 'pane-1',
            workspaceId: 'workspace-1',
            agent: 'codex',
            status: 'idle',
            title: 'Implementation',
            turnTitle: 'Add latest task titles',
          }}
        />
      </MemoryRouter>,
    )

    expect(screen.getByText('Add latest task titles')).toBeTruthy()
    expect(container.querySelector('.agent-pane-turn-title')).toBeTruthy()
  })

  it.each([
    ['absent', undefined],
    ['equal to the title', 'Implementation'],
  ])(
    'does not add a secondary line when the task title is %s',
    (_, turnTitle) => {
      const { container } = render(
        <MemoryRouter>
          <AgentPaneRow
            desktopId="desktop"
            pane={{
              id: 'pane-1',
              workspaceId: 'workspace-1',
              agent: 'codex',
              status: 'idle',
              title: 'Implementation',
              turnTitle,
            }}
          />
        </MemoryRouter>,
      )

      expect(container.querySelector('.agent-pane-turn-title')).toBeNull()
    },
  )

  it('keeps the trailing management affordance beside the agent mark', () => {
    const { container } = render(
      <MemoryRouter>
        <AgentPaneRow
          desktopId="desktop"
          pane={{
            id: 'pane-1',
            workspaceId: 'workspace-1',
            agent: 'codex',
            sessionAgent: 'claude',
            status: 'idle',
            title: 'Review changes',
          }}
        />
      </MemoryRouter>,
    )

    expect(container.querySelector('[data-agent-mark="claude"]')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'agents.tabActions' }))
    expect(openPane).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pane-1' }),
    )
  })

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
            turnTitle: 'Ship safer command approvals',
          }}
        />
      </MemoryRouter>,
    )

    await waitFor(() =>
      expect(screen.getByText('Run this command?')).toBeTruthy(),
    )
    expect(screen.getAllByText('Ship safer command approvals')).toHaveLength(2)
    expect(api.readHerdrPane).toHaveBeenCalledWith('pane-1', 'text', {
      source: 'visible',
    })
    fireEvent.click(screen.getByRole('button', { name: '3. No, cancel' }))
    expect(api.chooseHerdrMenuOption).toHaveBeenCalledWith('pane-1', 1, 3)
  })

  it('shows the transcript question word-for-word on a blocked row', async () => {
    api.readHerdrPane.mockResolvedValueOnce({
      read: {
        text: 'Which environment should I deploy th\n❯ 1. Staging\n  2. Production',
      },
    })
    api.getHerdrChat.mockResolvedValueOnce({
      page: {
        items: [
          {
            id: 't1',
            kind: 'tool',
            tool: {
              name: 'AskUserQuestion',
              done: false,
              input: {
                questions: [
                  {
                    header: 'Deploy',
                    question: 'Which environment should I deploy the build to?',
                    options: [{ label: 'Staging' }, { label: 'Production' }],
                  },
                ],
              },
            },
          },
        ],
      },
    })
    render(
      <MemoryRouter>
        <AgentPaneRow
          desktopId="desktop"
          pane={{
            id: 'pane-1',
            workspaceId: 'workspace-1',
            agent: 'claude',
            status: 'blocked',
            title: 'Deploy',
          }}
        />
      </MemoryRouter>,
    )
    await waitFor(() =>
      expect(
        screen.getByText('Which environment should I deploy the build to?'),
      ).toBeTruthy(),
    )
    expect(api.getHerdrChat).toHaveBeenCalledWith('pane-1')
    expect(screen.getByRole('button', { name: '1. Staging' })).toBeTruthy()
  })
})
