// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const keyboard = vi.hoisted(() => ({
  listeners: [] as Array<() => void>,
  show: vi.fn(() => Promise.resolve()),
  addListener: vi.fn((_event: string, listener: () => void) => {
    keyboard.listeners.push(listener)
    return Promise.resolve({ remove: vi.fn(() => Promise.resolve()) })
  }),
}))
const native = vi.hoisted(() => ({ value: true }))
vi.mock('@capacitor/keyboard', () => ({
  Keyboard: { show: keyboard.show, addListener: keyboard.addListener },
}))
vi.mock('../nativeRuntime', () => ({ isNativePlatform: () => native.value }))

import { KEYBOARD_GRACE_MS, focusToType } from './typingFocus'

let box: HTMLTextAreaElement

beforeEach(() => {
  vi.useFakeTimers()
  keyboard.listeners = []
  keyboard.show.mockClear()
  keyboard.addListener.mockClear()
  native.value = true
  box = document.createElement('textarea')
  document.body.append(box)
})

afterEach(() => {
  vi.useRealTimers()
  box.remove()
})

const keyboardShows = () => keyboard.listeners.forEach((listener) => listener())

describe('focusToType', () => {
  it('focuses the box and leaves the keyboard alone once it shows', async () => {
    focusToType(box)
    expect(document.activeElement).toBe(box)
    await vi.advanceTimersByTimeAsync(0)
    keyboardShows()
    await vi.advanceTimersByTimeAsync(KEYBOARD_GRACE_MS)
    expect(keyboard.show).not.toHaveBeenCalled()
  })

  it('raises the keyboard itself when focus did not', async () => {
    focusToType(box)
    await vi.advanceTimersByTimeAsync(KEYBOARD_GRACE_MS)
    expect(keyboard.show).toHaveBeenCalledTimes(1)
  })

  it('does not raise it for a box that lost focus meanwhile', async () => {
    focusToType(box)
    box.blur()
    await vi.advanceTimersByTimeAsync(KEYBOARD_GRACE_MS)
    expect(keyboard.show).not.toHaveBeenCalled()
  })

  it('only focuses on the web, where there is no native keyboard', async () => {
    native.value = false
    focusToType(box)
    expect(document.activeElement).toBe(box)
    await vi.advanceTimersByTimeAsync(KEYBOARD_GRACE_MS)
    expect(keyboard.addListener).not.toHaveBeenCalled()
    expect(keyboard.show).not.toHaveBeenCalled()
  })
})
