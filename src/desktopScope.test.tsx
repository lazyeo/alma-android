// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { DesktopScope } from './App'
import {
  DesktopsContext,
  useConnection,
  type DesktopsValue,
} from './desktops/DesktopContext'
import { useThreadQueue } from './extensions'
import { LanguageProvider } from './i18n'
import { useThreadDraft } from './screens/useThreadDraft'
import { DRAFT_SAVE_DELAY_MS, loadDraft } from './screens/threadDrafts'
import { addQueuedMessage, loadThreadQueue } from './screens/threadQueue'

// The thread screen keeps the composer text and the outbox in component state
// bound to the desktop it mounted under; isolation depends on DesktopScope
// remounting the screen per desktop, so this drives the real hooks through it.
function Composer() {
  const { pairing } = useConnection()
  const draft = useThreadDraft(pairing.id, 'thread-1')
  const [text, setText] = useState(draft.savedText)
  const queue = useThreadQueue(pairing.id, 'thread-1', {})
  return (
    <section>
      <textarea
        aria-label="composer"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          draft.update(event.target.value)
        }}
      />
      <button
        onClick={() =>
          void queue.controller.update({
            ...queue.queue,
            messages: addQueuedMessage(
              queue.queue.messages,
              `queued on ${pairing.id}`,
              [],
              1,
              `q-${pairing.id}`,
            ),
          })
        }
      >
        Queue
      </button>
      <ul aria-label="outbox">
        {queue.queue.messages.map((message) => (
          <li key={message.id}>{message.content}</li>
        ))}
      </ul>
    </section>
  )
}

function Switch({ to }: { to: string }) {
  const navigate = useNavigate()
  return (
    <button onClick={() => navigate(`/d/${to}/threads/thread-1`)}>
      Switch {to}
    </button>
  )
}

const summary = (id: string) => {
  const pairing = { id, name: id } as never
  const connection = {
    pairing,
    api: {} as never,
    tunnel: {} as never,
    status: 'online' as const,
    transport: 'relay' as const,
    latency: { transport: 'relay' as const, ms: null, sampledAt: 0 },
  }
  const { status, transport, latency } = connection
  return { pairing, connection, status, transport, latency }
}

beforeEach(() => {
  vi.useFakeTimers()
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
      clear: () => values.clear(),
    },
  })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

it("keeps each desktop's draft and outbox to itself across a switch", async () => {
  const desktops = {
    store: { pairings: [], activeId: 'mba' },
    desktops: [summary('mba'), summary('mini')],
    activate: vi.fn(),
  } as unknown as DesktopsValue
  render(
    <LanguageProvider>
      <DesktopsContext.Provider value={desktops}>
        <MemoryRouter initialEntries={['/d/mba/threads/thread-1']}>
          <Switch to="mini" />
          <Switch to="mba" />
          <Routes>
            <Route path="/d/:desktopId" element={<DesktopScope />}>
              <Route path="threads/:threadId" element={<Composer />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </DesktopsContext.Provider>
    </LanguageProvider>,
  )
  const composer = () =>
    screen.getByRole('textbox', { name: 'composer' }) as HTMLTextAreaElement
  const outbox = () => screen.getByRole('list', { name: 'outbox' }).textContent

  fireEvent.change(composer(), { target: { value: 'draft on mba' } })
  // The queue controller resolves asynchronously.
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Queue' }))
  })
  act(() => vi.advanceTimersByTime(DRAFT_SAVE_DELAY_MS))
  expect(outbox()).toBe('queued on mba')

  // Switching flushes the draft as the old screen unmounts, under mba only.
  fireEvent.click(screen.getByRole('button', { name: 'Switch mini' }))
  expect(composer().value).toBe('')
  expect(outbox()).toBe('')
  expect(loadDraft(localStorage, 'mini', 'thread-1')).toBeUndefined()
  expect(loadThreadQueue(localStorage, 'mini', 'thread-1')).toEqual([])

  fireEvent.change(composer(), { target: { value: 'draft on mini' } })
  fireEvent.click(screen.getByRole('button', { name: 'Switch mba' }))
  expect(composer().value).toBe('draft on mba')
  expect(outbox()).toBe('queued on mba')
  expect(loadDraft(localStorage, 'mini', 'thread-1')?.text).toBe(
    'draft on mini',
  )
})
