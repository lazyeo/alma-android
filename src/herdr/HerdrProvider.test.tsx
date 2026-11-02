// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
})
