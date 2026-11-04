// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ROW_EXIT_MS } from '../motionTokens'
import { QueuePanel } from './QueuePanel'
import type { QueuedMessage } from './threadQueue'

const FRAME = 16
const message = (id: string): QueuedMessage => ({
  id,
  content: `Queued ${id}`,
  attachedFiles: [],
  timestamp: 0,
})

function panel(messages: QueuedMessage[]) {
  return (
    <QueuePanel
      messages={messages}
      disabled={false}
      generating
      onSendNow={() => {}}
      onUpdate={() => {}}
      onSteer={() => {}}
    />
  )
}

const slot = (container: HTMLElement, id: string) =>
  container.querySelector(`[data-queue-id="${id}"]`)?.closest('.queue-slot')

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
    ],
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('queue rows', () => {
  it('opens with the rows already queued in place', () => {
    const { container } = render(panel([message('a'), message('b')]))
    expect(slot(container, 'a')?.className).toBe('queue-slot entered')
    expect(slot(container, 'b')?.className).toBe('queue-slot entered')
  })

  it('opens a slot for a newly queued row', () => {
    const { container, rerender } = render(panel([message('a')]))
    rerender(panel([message('a'), message('b')]))
    expect(slot(container, 'b')?.className).toBe('queue-slot entering')
    act(() => vi.advanceTimersByTime(FRAME * 2))
    expect(slot(container, 'b')?.className).toBe('queue-slot entered')
  })

  it('keeps a sent row in its closing slot until the slot has closed', () => {
    const { container, rerender } = render(panel([message('a'), message('b')]))
    rerender(panel([message('b')]))
    expect(slot(container, 'a')?.className).toBe('queue-slot exiting')
    expect(slot(container, 'b')?.className).toBe('queue-slot entered')
    act(() => vi.advanceTimersByTime(ROW_EXIT_MS - 1))
    expect(slot(container, 'a')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(slot(container, 'a')).toBeFalsy()
    expect(container.querySelectorAll('.queue-slot')).toHaveLength(1)
  })
})
