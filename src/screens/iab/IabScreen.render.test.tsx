// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IabScreen } from './IabScreen'
import type { IabTab } from './protocol'

const send = vi.fn()
const state: {
  bound?: boolean
  unsupported?: boolean
  videoLive?: boolean
  url?: string
  tabs?: IabTab[]
} = {}

vi.mock('../../i18n', () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key
  return { useT: () => t }
})

vi.mock('../../haptics', () => ({ haptic: vi.fn(async () => undefined) }))

vi.mock('./useIabStream', () => ({
  useIabStream: () => ({
    connected: true,
    unsupported: state.unsupported ?? false,
    bound: state.bound,
    page: { url: state.url ?? '', title: '', loading: false },
    tabs: state.tabs ?? [],
    activeTabId: state.tabs?.[0]?.id ?? '',
    viewport: { width: 1024, height: 700 },
    frame: undefined,
    stream: undefined,
    videoLive: state.videoLive ?? false,
    markVideoFrame: vi.fn(),
    rtcState: 'idle',
    error: '',
    send,
  }),
}))

const tunnel = { openIabSocket: vi.fn() }

function renderScreen(props: { onUnsupported?: () => void } = {}) {
  const view = render(
    <IabScreen
      tunnel={tunnel}
      threadId="thread-1"
      onClose={vi.fn()}
      {...props}
    />,
  )
  const surface = document.querySelector<HTMLElement>('.iab-surface')!
  // The picture fills a 512×350 box: half the page's CSS pixels.
  surface.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 512, height: 350 }) as DOMRect
  surface.setPointerCapture = vi.fn()
  return { ...view, surface }
}

beforeEach(() => {
  send.mockClear()
  for (const key of Object.keys(state)) delete state[key as keyof typeof state]
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('IabScreen', () => {
  it('taps the page pixel under the finger', () => {
    state.bound = true
    state.videoLive = true
    vi.useFakeTimers()
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    const { surface } = renderScreen()
    const at = {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 128,
      clientY: 175,
    }
    fireEvent.pointerDown(surface, at)
    fireEvent.pointerUp(surface, at)
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(send).toHaveBeenCalledWith({ type: 'tap', x: 256, y: 350 })
  })

  it('scrolls the page against the finger', () => {
    state.bound = true
    state.videoLive = true
    const { surface } = renderScreen()
    fireEvent.pointerDown(surface, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 200,
      clientY: 300,
      timeStamp: 0,
    })
    fireEvent.pointerMove(surface, {
      pointerId: 1,
      pointerType: 'touch',
      clientX: 200,
      clientY: 200,
      timeStamp: 16,
    })
    const scroll = send.mock.calls.find(([value]) => value.type === 'scroll')
    expect(scroll?.[0]).toMatchObject({ type: 'scroll', dx: 0, dy: 200 })
  })

  it('sends nothing while the browser is closed, and says how to open one', () => {
    state.bound = false
    vi.useFakeTimers()
    vi.spyOn(performance, 'now').mockImplementation(() => Date.now())
    const { surface } = renderScreen()
    expect(screen.getByText('browser.closedTitle')).toBeTruthy()
    const at = { pointerId: 1, pointerType: 'touch', clientX: 10, clientY: 10 }
    fireEvent.pointerDown(surface, at)
    fireEvent.pointerUp(surface, at)
    act(() => {
      vi.advanceTimersByTime(1_000)
    })
    expect(send).not.toHaveBeenCalled()
  })

  it('opens an address on the computer from the address bar', () => {
    state.bound = false
    renderScreen()
    const input = screen.getByRole('textbox', { name: 'browser.address' })
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: 'localhost:5173' } })
    fireEvent.submit(input.closest('form')!)
    expect(send).toHaveBeenCalledWith({
      type: 'navigate',
      url: 'localhost:5173',
    })
  })

  it('shows the page address, but nothing for a blank page', () => {
    state.bound = true
    state.url = 'about:blank'
    const { rerender } = renderScreen()
    const input = () =>
      screen.getByRole<HTMLInputElement>('textbox', { name: 'browser.address' })
    expect(input().value).toBe('')
    state.url = 'http://localhost:5173/'
    rerender(
      <IabScreen tunnel={tunnel} threadId="thread-1" onClose={vi.fn()} />,
    )
    expect(input().value).toBe('http://localhost:5173/')
  })

  it('switches, closes and opens tabs on the computer', () => {
    state.bound = true
    state.videoLive = true
    state.tabs = [
      {
        id: 't1',
        url: 'https://a.test/',
        title: 'A',
        loading: false,
        pinned: false,
        agent: true,
      },
      {
        id: 't2',
        url: 'https://b.test/',
        title: 'B',
        loading: false,
        pinned: false,
        agent: false,
      },
    ]
    renderScreen()
    fireEvent.click(
      screen.getByRole('button', { name: 'browser.tabs:{"count":2}' }),
    )
    expect(screen.getByText('browser.agentTab')).toBeTruthy()
    fireEvent.click(
      screen.getByRole('button', { name: 'browser.closeTab:{"title":"A"}' }),
    )
    expect(send).toHaveBeenLastCalledWith({
      type: 'tab',
      action: 'close',
      id: 't1',
    })
    fireEvent.click(screen.getByText('B'))
    expect(send).toHaveBeenLastCalledWith({
      type: 'tab',
      action: 'view',
      id: 't2',
    })
  })

  it('types and presses keys on the page', () => {
    state.bound = true
    state.videoLive = true
    renderScreen()
    fireEvent.click(screen.getByRole('button', { name: 'browser.keyboard' }))
    const field = screen.getByPlaceholderText('browser.keyboardPlaceholder')
    fireEvent.change(field, { target: { value: 'hello' } })
    fireEvent.submit(field.closest('form')!)
    expect(send).toHaveBeenLastCalledWith({ type: 'text', text: 'hello' })
    fireEvent.click(screen.getByRole('button', { name: 'screen.enter' }))
    expect(send).toHaveBeenLastCalledWith({ type: 'key', key: 'Enter' })
  })

  it('explains an unsupported desktop and reports it', () => {
    state.unsupported = true
    const onUnsupported = vi.fn()
    renderScreen({ onUnsupported })
    expect(screen.getByText('browser.unsupportedTitle')).toBeTruthy()
    expect(onUnsupported).toHaveBeenCalled()
  })
})
