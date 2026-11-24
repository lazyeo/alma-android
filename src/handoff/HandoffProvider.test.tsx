// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ThreadActivityProvider } from '../desktops/ThreadActivityProvider'
import { deliveredNotifications } from '../notifications'
import {
  HandoffProvider,
  TITLE_RETRY_BASE_MS,
  titleRetryDelay,
  useHandoff,
  type HandoffDesktop,
} from './HandoffProvider'

const notify = vi.hoisted(() => vi.fn(async () => true))
vi.mock('../notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../notifications')>()),
  showForegroundNotification: notify,
}))

afterEach(() => {
  vi.restoreAllMocks()
  cleanup()
  notify.mockClear()
  deliveredNotifications.clear()
})

const socket = () => ({
  opened: Promise.resolve(),
  close: vi.fn(),
  onClose: vi.fn(),
})

function desktopWith(
  listApprovals: () => Promise<unknown[]>,
  overrides: Record<string, unknown> = {},
): HandoffDesktop {
  const api: Record<string, unknown> = {
    listApprovals,
    listQuestions: vi.fn(async () => []),
    listThreads: vi.fn(async () => []),
    getThread: vi.fn(async () => null),
    openJsonSocket: vi.fn(socket),
    threadsSocket: vi.fn(socket),
    ...overrides,
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

describe('titles for threads the list lacks', () => {
  async function mount(desktop: HandoffDesktop) {
    render(
      <MemoryRouter>
        <ThreadActivityProvider>
          <HandoffProvider desktops={[desktop]}>
            <Probe />
          </HandoffProvider>
        </ThreadActivityProvider>
      </MemoryRouter>,
    )
    await act(async () => {
      await Promise.resolve()
    })
  }
  const refresh = () =>
    act(async () => {
      await handoff!.refresh()
    })

  it('fetches each unlisted thread once across repeated refreshes', async () => {
    const getThread = vi.fn(async (id: string) => ({ id, title: 'Sub-agent' }))
    await mount(desktopWith(async () => [approval], { getThread }))
    for (let index = 0; index < 5; index++) await refresh()

    expect(getThread).toHaveBeenCalledTimes(1)
    expect(getThread).toHaveBeenCalledWith('thread-1')
    expect(handoff!.threadTitles.desk?.['thread-1']).toBe('Sub-agent')
  })

  it('backs off a failed lookup instead of refetching every poll', async () => {
    let now = 1_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const getThread = vi.fn(async () => {
      throw new Error('404')
    })
    await mount(desktopWith(async () => [approval], { getThread }))
    expect(getThread).toHaveBeenCalledTimes(1)

    // Six 5s polls inside the first 30s backoff: no new request.
    for (let index = 0; index < 5; index++) {
      now += 5_000
      await refresh()
    }
    expect(getThread).toHaveBeenCalledTimes(1)

    now += 5_000
    await refresh()
    expect(getThread).toHaveBeenCalledTimes(2)
    // The second failure doubles the wait.
    now += TITLE_RETRY_BASE_MS
    await refresh()
    expect(getThread).toHaveBeenCalledTimes(2)
    now += TITLE_RETRY_BASE_MS
    await refresh()
    expect(getThread).toHaveBeenCalledTimes(3)
  })

  it('looks again once the request went away and came back', async () => {
    const lists = [[approval], [], [approval]]
    let call = 0
    const listApprovals = vi.fn(
      async () => lists[Math.min(call++, lists.length - 1)],
    )
    const getThread = vi.fn(async (id: string) => ({ id, title: 'T' }))
    await mount(desktopWith(listApprovals, { getThread }))
    await refresh()
    await refresh()
    expect(getThread).toHaveBeenCalledTimes(2)
  })

  it('caps the retry delay', () => {
    expect(titleRetryDelay(1)).toBe(30_000)
    expect(titleRetryDelay(2)).toBe(60_000)
    expect(titleRetryDelay(20)).toBe(600_000)
  })
})
