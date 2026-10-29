// @vitest-environment jsdom
import { act, cleanup, render, renderHook } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { installed } from '@alma/extensions-installed'
import {
  ExtensionProvider,
  ExtensionSettings,
  ExtensionNotifications,
  useThreadListAccessory,
  useThreadQueue,
  useDesktopEventHook,
  useNotificationSuppression,
} from './index'
import { createExtensionMessages } from './messages'
import { setLanguage } from '../i18n/runtime'

vi.mock('@alma/extensions-installed', () => ({ installed: {} }))
beforeEach(() => {
  const data = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
    removeItem: (key: string) => data.delete(key),
    clear: () => data.clear(),
  })
})
afterEach(() => {
  cleanup()
  for (const key of Object.keys(installed))
    delete (installed as Record<string, unknown>)[key]
  setLanguage('en')
  window.localStorage.clear()
})
it('defaults to empty UI and keeps local queues desktop scoped', async () => {
  const view = render(
    <ExtensionProvider>
      <ExtensionSettings />
      <span>child</span>
    </ExtensionProvider>,
  )
  expect(view.container.textContent).toBe('child')
  const a = renderHook(() => useThreadQueue('a', 't', {}))
  await act(async () => {
    await a.result.current.controller.update({
      messages: [
        { id: 'q', content: 'hello', attachedFiles: [], timestamp: 1 },
      ],
      autoSendWhenIdle: true,
    })
  })
  expect(
    renderHook(() => useThreadQueue('a', 't', {})).result.current.queue
      .messages,
  ).toHaveLength(1)
  expect(
    renderHook(() => useThreadQueue('b', 't', {})).result.current.queue
      .messages,
  ).toEqual([])
  expect(
    renderHook(() => useNotificationSuppression()).result.current('a'),
  ).toBe(false)
})
it('renders the installed provider, settings and notification accessory', () => {
  installed.Provider = ({ children }) => <article>{children}</article>
  installed.Settings = () => <span>settings</span>
  installed.Notifications = ({ onPermissionGranted }) => (
    <button onClick={onPermissionGranted}>notify</button>
  )
  const granted = vi.fn()
  const view = render(
    <ExtensionProvider>
      <ExtensionSettings />
      <ExtensionNotifications
        preferences={{
          approvals: true,
          questions: true,
          generationComplete: true,
          agentNeedsYou: true,
        }}
        onPermissionGranted={granted}
      />
    </ExtensionProvider>,
  )
  expect(view.container.querySelector('article')?.textContent).toBe(
    'settingsnotify',
  )
  view.getByRole('button').click()
  expect(granted).toHaveBeenCalledOnce()
})
it('passes desktop/thread identity and composer options to the queue and list hooks', () => {
  installed.useThreadListAccessory = (desktopId) => (threadId) =>
    desktopId === 'd' && threadId === 't' ? 7 : undefined
  expect(
    renderHook(() => useThreadListAccessory('d')).result.current('t'),
  ).toBe(7)
  const update = vi.fn(async () => true)
  installed.useThreadQueue = (desktopId, threadId, options) => ({
    queue: { messages: [], autoSendWhenIdle: false },
    mode: 'remote',
    busy: false,
    controller: { update, action: async () => true },
    accessory: (
      <span>
        {desktopId}/{threadId}/{options.model}
      </span>
    ),
  })
  const queue = renderHook(() => useThreadQueue('d', 't', { model: 'm' }))
    .result.current
  expect(render(<>{queue.accessory}</>).container.textContent).toBe('d/t/m')
  expect(queue.mode).toBe('remote')
})
it('delivers desktop events and suppresses notifications only for the chosen desktop', () => {
  const event = { type: 'generation_completed', data: { threadId: 't' } }
  const receive = vi.fn()
  installed.useDesktopEventHook = (desktopId) => (value) =>
    receive(desktopId, value)
  installed.useNotificationSuppression = () => (desktopId) => desktopId === 'a'
  renderHook(() => useDesktopEventHook('a')).result.current(event)
  expect(receive).toHaveBeenCalledWith('a', event)
  const suppress = renderHook(() => useNotificationSuppression()).result.current
  expect(suppress('a')).toBe(true)
  expect(suppress('b')).toBe(false)
})
it('owns typed locale messages without widening core catalogs', () => {
  const messages = createExtensionMessages({
    en: { greeting: 'Hello {name}' },
    zh: { greeting: '你好，{name}' },
  })
  expect(messages.t('greeting', { name: 'A' })).toBe('Hello A')
  setLanguage('zh')
  expect(messages.t('greeting', { name: 'A' })).toBe('你好，A')
  expect(
    renderHook(() => messages.useT()).result.current('greeting', { name: 'B' }),
  ).toBe('你好，B')
})

it('keeps a failed local queue write visible and leaves the queue unchanged', async () => {
  const queue = renderHook(() => useThreadQueue('a', 't', {}))
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
    throw new Error('disk full')
  })
  await act(async () => {
    expect(
      await queue.result.current.controller.update({
        messages: [
          { id: 'q', content: 'hello', attachedFiles: [], timestamp: 1 },
        ],
        autoSendWhenIdle: false,
      }),
    ).toBe(false)
  })
  expect(queue.result.current.queue.messages).toEqual([])
  expect(
    render(<>{queue.result.current.accessory}</>).getByRole('status')
      .textContent,
  ).toBe('Could not save queue on this device.')
})
