import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  createLoadCounter,
  createLoadGate,
  type LoadTicket,
} from './threadLoadGate'

afterEach(() => vi.useRealTimers())

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => (resolve = done))
  return { promise, resolve }
}

function setup() {
  const calls: Array<{
    ticket: LoadTicket
    reason: string
    respond(): Promise<void>
  }> = []
  const committed: number[] = []
  const gate = createLoadGate<string>({
    run(ticket, reason) {
      const response = deferred()
      const settled = response.promise.then(() => {
        if (ticket.commit()) committed.push(ticket.seq)
      })
      calls.push({
        ticket,
        reason,
        respond: async () => {
          response.resolve()
          await settled
        },
      })
      return settled
    },
  })
  const flush = () => new Promise((done) => setTimeout(done, 0))
  return { gate, calls, committed, flush }
}

describe('createLoadGate', () => {
  it('runs one load at a time and coalesces requests into one trailing load', async () => {
    const { gate, calls, committed, flush } = setup()
    const first = gate.request('open')
    const second = gate.request('thread-updated')
    const third = gate.request('delta-resync')
    await flush()
    expect(calls.map((call) => call.reason)).toEqual(['open'])

    await calls[0].respond()
    await first
    await flush()
    // Only the latest queued reason runs, once.
    expect(calls.map((call) => call.reason)).toEqual(['open', 'delta-resync'])

    await calls[1].respond()
    await Promise.all([second, third])
    expect(committed).toEqual([1, 2])
  })

  it('drops a response that is older than the latest committed one', async () => {
    const { gate, calls, committed, flush } = setup()
    void gate.request('open')
    await flush()
    // Switching threads leaves the old request in flight beside a new one.
    gate.invalidate()
    void gate.request('open')
    await flush()
    expect(calls).toHaveLength(2)

    await calls[1].respond()
    await calls[0].respond()
    expect(committed).toEqual([2])
    expect(calls[0].ticket.isCurrent()).toBe(false)
  })

  it('does not run a trailing load queued before invalidate', async () => {
    const { gate, calls, flush } = setup()
    void gate.request('open')
    void gate.request('thread-updated')
    await flush()
    gate.invalidate()
    await calls[0].respond()
    await flush()
    expect(calls).toHaveLength(1)
  })
})

describe('createLoadCounter', () => {
  it('reports per-reason counts once per window and warns on a storm', () => {
    vi.useFakeTimers()
    const log = vi.fn()
    const counter = createLoadCounter<string>({
      label: 't1',
      log,
      verbose: false,
    })
    for (let i = 0; i < 40; i += 1) counter.count('delta-resync')
    counter.count('turn-end')
    vi.advanceTimersByTime(60_000)
    expect(log).toHaveBeenCalledWith(
      'warn',
      '[thread-load] t1: 41 loads in 60s',
      { 'delta-resync': 40, 'turn-end': 1 },
    )

    log.mockClear()
    counter.count('open')
    vi.advanceTimersByTime(60_000)
    // A quiet minute is only logged in dev.
    expect(log).not.toHaveBeenCalled()
  })
})
