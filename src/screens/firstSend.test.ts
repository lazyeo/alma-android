import { describe, expect, it, vi } from 'vitest'
import { loadDraft, saveDraft, type DraftStorage } from './threadDrafts'
import {
  clearStartDraftAfterDelivery,
  decideFirstSend,
  claimFirstSend,
  deliverFirstSend,
  releaseFirstSend,
  type FirstSendReadiness,
} from './firstSend'

class MemoryStorage implements DraftStorage {
  private values = new Map<string, string>()
  getItem(key: string) {
    return this.values.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
  removeItem(key: string) {
    this.values.delete(key)
  }
}

const ready: FirstSendReadiness = {
  desktopOnline: true,
  idleConfirmed: true,
  socketReady: true,
  queueMode: 'remote',
  queueBusy: false,
  directFailed: false,
}

describe('new-thread first-send decision', () => {
  it('uses the normal direct send while the paired desktop is online and idle', () => {
    expect(decideFirstSend(ready)).toBe('direct')
  })

  it('waits for the socket instead of queueing while the desktop is online', () => {
    expect(decideFirstSend({ ...ready, socketReady: false })).toBe('wait')
  })

  it('falls back to the remote extension queue when the desktop is offline', () => {
    expect(decideFirstSend({ ...ready, desktopOnline: false })).toBe('queue')
  })

  it('falls back to the local queue only when no remote extension owns the queue', () => {
    expect(
      decideFirstSend({
        ...ready,
        desktopOnline: false,
        queueMode: 'local',
      }),
    ).toBe('queue')
  })

  it('waits for queue ownership to resolve before falling back', () => {
    expect(
      decideFirstSend({
        ...ready,
        desktopOnline: false,
        queueMode: 'unavailable',
      }),
    ).toBe('wait')
  })

  it('falls back after a synchronous direct-send failure', () => {
    expect(decideFirstSend({ ...ready, directFailed: true })).toBe('queue')
  })
})

describe('new-thread first-send claim', () => {
  it('allows only one claimant across StrictMode remounts', () => {
    expect(claimFirstSend('desktop-1', 'thread-1', 'message-1')).toBe(true)
    expect(claimFirstSend('desktop-1', 'thread-1', 'message-1')).toBe(false)
  })

  it('can release a failed attempt for queue fallback', () => {
    expect(claimFirstSend('desktop-2', 'thread-2', 'message-2')).toBe(true)
    releaseFirstSend('desktop-2', 'thread-2', 'message-2')
    expect(claimFirstSend('desktop-2', 'thread-2', 'message-2')).toBe(true)
  })
})

describe('new-thread start draft', () => {
  it.each(['sent', 'queued'] as const)(
    'clears the __start__ draft after %s',
    (result) => {
      const storage = new MemoryStorage()
      saveDraft(storage, 'desktop-1', '__start__', 'recover me', 1)

      expect(clearStartDraftAfterDelivery(storage, 'desktop-1', result)).toBe(
        true,
      )
      expect(loadDraft(storage, 'desktop-1', '__start__')).toBeUndefined()
    },
  )

  it.each(['wait', 'direct-failed', 'queue-failed'] as const)(
    'preserves the __start__ draft after %s',
    (result) => {
      const storage = new MemoryStorage()
      saveDraft(storage, 'desktop-1', '__start__', 'recover me', 1)

      expect(clearStartDraftAfterDelivery(storage, 'desktop-1', result)).toBe(
        false,
      )
      expect(loadDraft(storage, 'desktop-1', '__start__')?.text).toBe(
        'recover me',
      )
    },
  )
})

describe('new-thread first-send delivery', () => {
  it('does not write any queue when a remote extension is paired and the desktop is online', async () => {
    const sendDirect = vi.fn()
    const writeQueue = vi.fn()

    await expect(
      deliverFirstSend(ready, { sendDirect, writeQueue }),
    ).resolves.toBe('sent')

    expect(sendDirect).toHaveBeenCalledTimes(1)
    expect(writeQueue).not.toHaveBeenCalled()
  })

  it('reports a direct failure so the next decision can use the queue', async () => {
    const writeQueue = vi.fn()

    await expect(
      deliverFirstSend(ready, {
        sendDirect: () => {
          throw new Error('socket closed')
        },
        writeQueue,
      }),
    ).resolves.toBe('direct-failed')

    expect(writeQueue).not.toHaveBeenCalled()
  })

  it('reports queue failure without treating the draft as sent', async () => {
    await expect(
      deliverFirstSend(
        { ...ready, desktopOnline: false },
        {
          sendDirect: vi.fn(),
          writeQueue: vi.fn().mockResolvedValue(false),
        },
      ),
    ).resolves.toBe('queue-failed')
  })
})
