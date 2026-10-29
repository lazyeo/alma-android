// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useHerdrNotificationEvents } from './HerdrProvider'

describe('useHerdrNotificationEvents', () => {
  it('emits blocked and working-to-done notifications once per transition', () => {
    const notify = vi.fn().mockResolvedValue(true)
    const { result, rerender } = renderHook(
      ({ panes }) =>
        useHerdrNotificationEvents({
          desktopId: 'desktop',
          desktopName: 'Mac',
          panes,
          mutedWorkspaces: [],
          pathname: '/d/desktop/agents',
          enabled: true,
          notify,
        }),
      {
        initialProps: {
          panes: [
            { pane_id: 'p1', workspace_id: 'w1', agent_status: 'working' },
          ],
        },
      },
    )
    act(() => result.current())
    expect(notify).not.toHaveBeenCalled()

    rerender({
      panes: [{ pane_id: 'p1', workspace_id: 'w1', agent_status: 'blocked' }],
    })
    act(() => result.current())
    act(() => result.current())
    expect(notify).toHaveBeenCalledTimes(1)

    rerender({
      panes: [{ pane_id: 'p1', workspace_id: 'w1', agent_status: 'working' }],
    })
    act(() => result.current())
    rerender({
      panes: [{ pane_id: 'p1', workspace_id: 'w1', agent_status: 'done' }],
    })
    act(() => result.current())
    expect(notify).toHaveBeenCalledTimes(2)
  })
})
