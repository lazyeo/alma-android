// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { createNotificationDeduper } from '../notifications'
import { useHerdrNotificationEvents } from './HerdrProvider'
import type { HerdrPane } from './model'

describe('useHerdrNotificationEvents', () => {
  it('includes blocked questions and completed assistant messages', async () => {
    const notify = vi.fn().mockResolvedValue(true)
    const api = {
      readHerdrPane: vi.fn().mockResolvedValue({
        read: {
          text: 'Should I run the release build?\n> 1. Yes\n  2. No',
        },
      }),
      getHerdrChat: vi.fn().mockResolvedValue({
        page: {
          items: [
            { id: 'a1', kind: 'assistant', text: 'All checks passed.\nReady.' },
          ],
        },
      }),
    }
    const { result, rerender } = renderHook(
      ({ panes }: { panes: HerdrPane[] }) =>
        useHerdrNotificationEvents({
          desktopId: 'desktop',
          desktopName: 'Mac',
          panes,
          mutedWorkspaces: [],
          pathname: '/d/desktop/agents',
          enabled: true,
          api,
          notify,
        }),
      {
        initialProps: {
          panes: [
            {
              pane_id: 'p1',
              workspace_id: 'w1',
              agent_status: 'working',
            },
          ] as HerdrPane[],
        },
      },
    )
    act(() => result.current())
    expect(notify).not.toHaveBeenCalled()

    rerender({
      panes: [
        {
          pane_id: 'p1',
          workspace_id: 'w1',
          agent_status: 'blocked',
          terminal_title_stripped: 'Release checks',
          turn_title: 'Run the release build',
        },
      ],
    })
    act(() => result.current())
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1))
    expect(notify.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        threadTitle: 'Release checks — Run the release build',
        message: 'Should I run the release build?',
      }),
    )

    rerender({
      panes: [{ pane_id: 'p1', workspace_id: 'w1', agent_status: 'working' }],
    })
    act(() => result.current())
    rerender({
      panes: [{ pane_id: 'p1', workspace_id: 'w1', agent_status: 'done' }],
    })
    act(() => result.current())
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(2))
    expect(notify.mock.calls[1][0].message).toBe('All checks passed.\nReady.')
  })

  it('falls back to chat when a blocked screen cannot be read', async () => {
    const notify = vi.fn().mockResolvedValue(true)
    const api = {
      readHerdrPane: vi.fn().mockRejectedValue(new Error('screen unavailable')),
      getHerdrChat: vi.fn().mockResolvedValue({
        page: {
          items: [
            {
              id: 'a1',
              kind: 'assistant',
              text: '\nShould I continue?\nMore detail',
            },
          ],
        },
      }),
    }
    const { result, rerender } = renderHook(
      ({ panes }: { panes: HerdrPane[] }) =>
        useHerdrNotificationEvents({
          desktopId: 'desktop',
          desktopName: 'Mac',
          panes,
          mutedWorkspaces: [],
          pathname: '/d/desktop/agents',
          enabled: true,
          api,
          notify,
        }),
      {
        initialProps: {
          panes: [
            {
              pane_id: 'p1',
              workspace_id: 'w1',
              agent_status: 'working',
            },
          ] as HerdrPane[],
        },
      },
    )
    act(() => result.current())
    rerender({
      panes: [{ pane_id: 'p1', workspace_id: 'w1', agent_status: 'blocked' }],
    })
    act(() => result.current())
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1))
    expect(notify.mock.calls[0][0].message).toBe('Should I continue?')
  })

  it('still notifies with old copy when message fetching fails', async () => {
    const notify = vi.fn().mockResolvedValue(true)
    const api = {
      readHerdrPane: vi.fn().mockRejectedValue(new Error('offline')),
      getHerdrChat: vi.fn().mockRejectedValue(new Error('offline')),
    }
    const { result, rerender } = renderHook(
      ({ panes }: { panes: HerdrPane[] }) =>
        useHerdrNotificationEvents({
          desktopId: 'desktop',
          desktopName: 'Mac',
          panes,
          mutedWorkspaces: [],
          pathname: '/d/desktop/agents',
          enabled: true,
          api,
          notify,
        }),
      {
        initialProps: {
          panes: [
            {
              pane_id: 'p1',
              workspace_id: 'w1',
              agent_status: 'working',
            },
          ] as HerdrPane[],
        },
      },
    )
    act(() => result.current())
    rerender({
      panes: [
        {
          pane_id: 'p1',
          workspace_id: 'w1',
          agent_status: 'blocked',
          terminal_title_stripped: 'Release checks',
        },
      ],
    })
    act(() => result.current())
    await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1))
    expect(notify.mock.calls[0][0].threadTitle).toBe('Release checks')
    expect(notify.mock.calls[0][0].message).toBeUndefined()
  })

  function renderEvents(api: {
    readHerdrPane: ReturnType<typeof vi.fn>
    getHerdrChat: ReturnType<typeof vi.fn>
  }) {
    const notify = vi.fn().mockResolvedValue(true)
    const dedupe = createNotificationDeduper()
    const hook = renderHook(
      ({ status }: { status: string }) =>
        useHerdrNotificationEvents({
          desktopId: 'desktop',
          desktopName: 'Mac',
          panes: [{ pane_id: 'p1', workspace_id: 'w1', agent_status: status }],
          mutedWorkspaces: [],
          pathname: '/d/desktop/agents',
          enabled: true,
          api,
          notify,
          dedupe,
        }),
      { initialProps: { status: 'working' } },
    )
    act(() => hook.result.current())
    const step = async (status: string) => {
      hook.rerender({ status })
      act(() => hook.result.current())
      // Let the async enrichment (screen + chat reads) settle.
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
    }
    return { notify, step }
  }

  const askTool = (id: string, question: string, done = false) => ({
    id,
    kind: 'tool',
    tool: {
      name: 'AskUserQuestion',
      done,
      input: {
        questions: [
          {
            header: 'Deploy',
            question,
            options: [{ label: 'Staging' }, { label: 'Production' }],
          },
        ],
      },
    },
  })

  it('alerts once when blocked flickers away and back for the same pending tool', async () => {
    let items: unknown[] = [
      { id: 'u1', kind: 'user', text: 'ship it' },
      askTool('t1', 'Where should I deploy?'),
    ]
    const { notify, step } = renderEvents({
      readHerdrPane: vi.fn().mockResolvedValue({ read: { text: '' } }),
      getHerdrChat: vi.fn(async () => ({ page: { items } })),
    })
    await step('blocked')
    await step('working')
    await step('blocked')
    await step('idle')
    await step('blocked')
    expect(notify).toHaveBeenCalledTimes(1)

    // A new prompt is a new pending tool call and alerts again.
    items = [
      ...items.slice(0, 1),
      askTool('t1', 'Where?', true),
      askTool('t2', 'Tag it?'),
    ]
    await step('working')
    await step('blocked')
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it('alerts once when done flickers without a new transcript turn', async () => {
    let items: unknown[] = [{ id: 'a1', kind: 'assistant', text: 'Done.' }]
    const { notify, step } = renderEvents({
      readHerdrPane: vi.fn(),
      getHerdrChat: vi.fn(async () => ({ page: { items } })),
    })
    await step('done')
    await step('working')
    await step('done')
    expect(notify).toHaveBeenCalledTimes(1)

    items = [
      ...items,
      { id: 'u2', kind: 'user', text: 'again' },
      { id: 'a2', kind: 'assistant', text: 'Again.' },
    ]
    await step('working')
    await step('done')
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it('keeps alerting on every transition when the transcript is unavailable', async () => {
    const { notify, step } = renderEvents({
      readHerdrPane: vi.fn().mockRejectedValue(new Error('offline')),
      getHerdrChat: vi.fn().mockRejectedValue(new Error('offline')),
    })
    await step('blocked')
    await step('working')
    await step('blocked')
    expect(notify).toHaveBeenCalledTimes(2)
  })

  it('takes the blocked question word-for-word from the transcript over the screen', async () => {
    const { notify, step } = renderEvents({
      readHerdrPane: vi.fn().mockResolvedValue({
        read: {
          text: 'Where should I deploy the release candidate for t\n❯ 1. Staging\n  2. Production',
        },
      }),
      getHerdrChat: vi.fn().mockResolvedValue({
        page: {
          items: [
            askTool(
              't1',
              'Where should I deploy the release candidate for testing?',
            ),
          ],
        },
      }),
    })
    await step('blocked')
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0].message).toBe(
      'Where should I deploy the release candidate for testing?',
    )
  })

  it('links each computer’s alert to that computer, even while another is shown', async () => {
    const notify = vi.fn().mockResolvedValue(true)
    const api = {
      readHerdrPane: vi.fn().mockResolvedValue({ read: { text: '' } }),
      getHerdrChat: vi.fn().mockResolvedValue({ page: { items: [] } }),
    }
    const panes = (status: string) =>
      [
        { pane_id: 'w1:p1', workspace_id: 'w1', agent_status: status },
      ] as HerdrPane[]
    const run = async (computerId: string | undefined, viewing: boolean) => {
      notify.mockClear()
      const { result, rerender } = renderHook(
        ({ status }: { status: string }) =>
          useHerdrNotificationEvents({
            desktopId: 'desktop',
            computerId,
            viewingComputer: viewing,
            desktopName: 'Mac',
            panes: panes(status),
            mutedWorkspaces: [],
            // The same pane id is open, but on the other computer.
            pathname: '/d/desktop/agents/w1%3Ap1',
            enabled: true,
            api,
            notify,
            dedupe: createNotificationDeduper(),
          }),
        { initialProps: { status: 'working' } },
      )
      act(() => result.current())
      rerender({ status: 'done' })
      act(() => result.current())
      await vi.waitFor(() => expect(notify).toHaveBeenCalledTimes(1))
      return notify.mock.calls[0][0]
    }
    expect(await run(undefined, false)).toEqual(
      expect.objectContaining({
        url: '/d/desktop/agents/w1%3Ap1?computer=this',
      }),
    )
    const remote = await run('0123456789abcdef', false)
    expect(remote.url).toBe(
      '/d/desktop/agents/w1%3Ap1?computer=0123456789abcdef',
    )
    expect(remote.tag).toContain('0123456789abcdef/w1:p1')
  })
})
