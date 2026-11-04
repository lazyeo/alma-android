// @vitest-environment jsdom
import { act, render } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FADE_EXIT_MS } from '../motionTokens'
import { nextRolling, RollingText } from './RollingText'

const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})
afterEach(() => vi.useRealTimers())

const lines = (container: HTMLElement) =>
  [...container.querySelectorAll('.rolling-text-line')].map((line) => ({
    text: line.textContent,
    previous: line.classList.contains('rolling-text-previous'),
    rolling: line.classList.contains('rolling-text-current'),
    hidden: line.getAttribute('aria-hidden') === 'true',
  }))

describe('nextRolling', () => {
  it('keeps the same state for the same word', () => {
    const state = { current: { id: 0, text: 'Thinking' } }
    expect(nextRolling(state, 'Thinking')).toBe(state)
  })

  it('moves the current word out and the new word in', () => {
    expect(nextRolling({ current: { id: 3, text: 'A' } }, 'B')).toEqual({
      current: { id: 4, text: 'B' },
      previous: { id: 3, text: 'A' },
    })
  })
})

describe('RollingText', () => {
  it('shows the first word without a roll', () => {
    const { container } = render(<RollingText text="Thinking" />)
    expect(lines(container)).toEqual([
      { text: 'Thinking', previous: false, rolling: false, hidden: false },
    ])
  })

  it('rolls the old word out while the new word rolls in, then drops it', () => {
    const { container, rerender } = render(<RollingText text="Thinking" />)
    rerender(<RollingText text="Reading files" />)
    expect(lines(container)).toEqual([
      { text: 'Thinking', previous: true, rolling: false, hidden: true },
      { text: 'Reading files', previous: false, rolling: true, hidden: false },
    ])
    act(() => vi.advanceTimersByTime(FADE_EXIT_MS - 1))
    expect(lines(container)).toHaveLength(2)
    act(() => vi.advanceTimersByTime(1))
    expect(lines(container)).toEqual([
      { text: 'Reading files', previous: false, rolling: true, hidden: false },
    ])
  })

  it('restarts the exit timer when the word changes again mid-roll', () => {
    const { container, rerender } = render(<RollingText text="A" />)
    rerender(<RollingText text="B" />)
    act(() => vi.advanceTimersByTime(FADE_EXIT_MS - 20))
    rerender(<RollingText text="C" />)
    act(() => vi.advanceTimersByTime(20))
    expect(lines(container).map((line) => line.text)).toEqual(['B', 'C'])
    act(() => vi.advanceTimersByTime(FADE_EXIT_MS))
    expect(lines(container).map((line) => line.text)).toEqual(['C'])
  })

  it('rolls inside a clipped slot on transform and opacity only', () => {
    const slot = css.match(/\n\.rolling-text\s*{[^}]*}/)?.[0] ?? ''
    expect(slot).toContain('overflow: hidden;')
    expect(slot).toContain('position: relative;')
    const previous = css.match(/\n\.rolling-text-previous\s*{[^}]*}/)?.[0]
    // The outgoing word never sizes the slot.
    expect(previous).toContain('position: absolute;')
    expect(css).toMatch(
      /\.rolling-text-current\s*{\s*animation: status-roll-in var\(--dur-fast\) var\(--ease-out\) both;/,
    )
    expect(css).toMatch(
      /\.rolling-text-previous\s*{[^}]*animation: status-roll-out var\(--dur-fast\) var\(--ease-out\) both;/,
    )
  })
})
