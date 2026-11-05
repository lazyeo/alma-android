// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AlmaApi, Thread } from '../relay'
import { useThreadOrganize } from './ThreadOrganize'
import { gtdStatusOf } from './gtdModel'
import type { ThreadGtdStatus } from './threadGtd'

vi.mock('../haptics', () => ({ haptic: async () => undefined }))

afterEach(cleanup)

let organize: ReturnType<typeof useThreadOrganize>
let threads: Thread[]

function Harness({ api }: { api: AlmaApi }) {
  const [rows, setRows] = useState<Thread[]>([
    { id: 't1', title: 'Alpha', metadata: { gtdStatus: 'todo' } } as Thread,
  ])
  threads = rows
  organize = useThreadOrganize({
    api,
    threads: rows,
    setThreads: setRows,
    setError: () => undefined,
  })
  return <>{organize.overlays}</>
}

/** Writes stay pending until `settle()`, so the optimistic state is visible. */
function setup() {
  const pending: Array<() => void> = []
  const updateThread = vi.fn(
    () => new Promise<void>((resolve) => pending.push(resolve)),
  )
  render(<Harness api={{ updateThread } as unknown as AlmaApi} />)
  const move = (status: ThreadGtdStatus) => {
    let write: Promise<void> | undefined
    act(() => {
      write = organize.setStatus(threads[0]!, status)
    })
    return write!
  }
  const settle = async (write: Promise<void>) => {
    await act(async () => {
      pending.splice(0).forEach((resolve) => resolve())
      await write
    })
  }
  return { updateThread, move, settle }
}

const status = () => gtdStatusOf(threads[0]!)

describe('thread status changes', () => {
  it('marks a to-do done in place before the write returns', async () => {
    const { updateThread, move, settle } = setup()
    const write = move('done')
    expect(status()).toBe('done')
    expect(threads).toHaveLength(1)
    // The row's slot shows the marking-done spinner until the write lands.
    expect(organize.pendingDoneIds.has('t1')).toBe(true)
    expect(updateThread).toHaveBeenCalledWith(
      't1',
      expect.objectContaining({
        metadata: expect.objectContaining({ gtdStatus: 'done' }),
      }),
    )
    await settle(write)
    expect(organize.pendingDoneIds.has('t1')).toBe(false)
    expect(screen.getByText('Moved to Done')).toBeTruthy()
  })

  it.each(['inbox', 'in_progress', 'done'] as const)(
    'moves a to-do to %s in place',
    async (next) => {
      const { move, settle } = setup()
      const write = move(next)
      expect(status()).toBe(next)
      expect(threads).toHaveLength(1)
      await settle(write)
    },
  )

  it('puts the row back in place on Undo', async () => {
    const { updateThread, move, settle } = setup()
    await settle(move('done'))
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }))
    expect(status()).toBe('todo')
    expect(threads).toHaveLength(1)
    expect(updateThread).toHaveBeenLastCalledWith(
      't1',
      expect.objectContaining({
        metadata: expect.objectContaining({ gtdStatus: 'todo' }),
      }),
    )
  })
})
