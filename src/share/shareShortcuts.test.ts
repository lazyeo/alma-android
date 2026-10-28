import { beforeEach, describe, expect, it, vi } from 'vitest'
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
})
