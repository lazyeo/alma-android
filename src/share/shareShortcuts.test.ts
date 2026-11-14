import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Thread } from '../relay'
import {
  createShareShortcutPublisher,
  desktopShareShortcuts,
} from './shareShortcuts'

const options = {
  shortcuts: [{ id: 'thread:desk:one', label: 'One', desktopName: 'Desktop' }],
  activeDesktopIds: ['desk'],
}

describe('share shortcut publishing', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  it('publishes changed shortcuts once the debounce window has elapsed', async () => {
    const publish = vi.fn().mockResolvedValue(undefined)
    const schedule = createShareShortcutPublisher(publish)

    schedule(options)
    schedule(options)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(publish).toHaveBeenCalledTimes(1)
    expect(publish).toHaveBeenCalledWith(options)
  })

  it('does not republish an unchanged list after the debounce window', async () => {
    const publish = vi.fn().mockResolvedValue(undefined)
    const schedule = createShareShortcutPublisher(publish)

    schedule(options)
    await vi.advanceTimersByTimeAsync(60_000)
    schedule(options)
    await vi.advanceTimersByTimeAsync(60_000)

    expect(publish).toHaveBeenCalledTimes(1)
  })
})

describe('desktopShareShortcuts', () => {
  it('keeps other paired desktops active so their shortcuts survive', () => {
    const options = desktopShareShortcuts('a', 'Mac', [], ['a', 'b'])
    expect(options.activeDesktopIds).toEqual(['a', 'b'])
    expect(options.shortcuts.at(-1)?.label).toBe('New chat: Mac')
  })

  it('tells same-titled threads of two desktops apart', () => {
    const alma = { id: 'main', title: 'Alma' } as Thread
    const labels = [
      desktopShareShortcuts('a', 'MacBook', [alma], ['a', 'b']),
      desktopShareShortcuts('b', 'Mac mini', [alma], ['a', 'b']),
    ].map((options) => options.shortcuts[0].label)
    expect(labels).toEqual(['Alma on MacBook', 'Alma on Mac mini'])
  })

  it('gives no slot to her background run threads', () => {
    const run = (id: string) =>
      ({
        id,
        title: 'herdr · cairn',
        metadata: {
          personalRun: {
            runId: `r-${id}`,
            kind: 'dispatch',
            parentThreadId: 'a',
          },
        },
      }) as Thread
    const own = (id: string) => ({ id, title: id }) as Thread
    const options = desktopShareShortcuts(
      'a',
      'Mac',
      [run('run1'), own('t1'), run('run2'), own('t2'), own('t3')],
      ['a'],
      2,
    )
    expect(options.shortcuts.map((item) => item.label)).toEqual([
      't1',
      't2',
      'New chat: Mac',
    ])
  })
})
