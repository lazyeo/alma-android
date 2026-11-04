// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, expect, it, vi } from 'vitest'
import { ThreadActivityProvider } from '../desktops/ThreadActivityProvider'
import { deliveredNotifications } from '../notifications'
import {
  HandoffProvider,
  useHandoff,
  type HandoffDesktop,
} from './HandoffProvider'

const notify = vi.hoisted(() => vi.fn(async () => true))
vi.mock('../notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../notifications')>()),
  showForegroundNotification: notify,
}))

afterEach(() => {
  cleanup()
  notify.mockClear()
  deliveredNotifications.clear()
})

const socket = () => ({
  opened: Promise.resolve(),
  close: vi.fn(),
  onClose: vi.fn(),
})

function desktopWith(listApprovals: () => Promise<unknown[]>): HandoffDesktop {
  const api: Record<string, unknown> = {
    listApprovals,
    listQuestions: vi.fn(async () => []),
    listThreads: vi.fn(async () => []),
    getThread: vi.fn(async () => null),
    openJsonSocket: vi.fn(socket),
    threadsSocket: vi.fn(socket),
  }
  return {
    id: 'desk',
    name: 'Desk',
    online: true,
    api: new Proxy(api, {
      get: (target, key: string) => target[key] ?? vi.fn(async () => ({})),
    }) as unknown as HandoffDesktop['api'],
  }
}

let handoff: ReturnType<typeof useHandoff> | undefined
function Probe() {
  handoff = useHandoff()
  return null
}

const approval = { requestId: 'req-1', threadId: 'thread-1', toolName: 'Bash' }

it('alerts once for a request that drops out of a failed refresh and returns', async () => {
  const lists = [
    () => Promise.resolve([]), // initial load: nothing pending yet
    () => Promise.resolve([approval]), // request appears: alert
    () => Promise.reject(new Error('relay hiccup')), // transient failure
    () => Promise.resolve([approval]), // same request again: no alert
  ]
  let call = 0
  const listApprovals = vi.fn(() => lists[Math.min(call++, lists.length - 1)]())
  render(
    <MemoryRouter>
      <ThreadActivityProvider>
        <HandoffProvider desktops={[desktopWith(listApprovals)]}>
          <Probe />
        </HandoffProvider>
      </ThreadActivityProvider>
    </MemoryRouter>,
  )
  await act(async () => {
    await Promise.resolve()
  })
  for (
    let index = listApprovals.mock.calls.length;
    index < lists.length;
    index++
  )
    await act(async () => {
      await handoff!.refresh()
    })

  expect(listApprovals).toHaveBeenCalledTimes(lists.length)
  expect(notify).toHaveBeenCalledTimes(1)
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({ type: 'approval', tag: 'desk:req-1' }),
  )
})
