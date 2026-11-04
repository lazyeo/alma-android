// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ScreenStatus } from './protocol'
import { RemoteScreen } from './RemoteScreen'
import type { ScreenTarget } from './screenTargets'
import type { ScreenWindowList } from './useRemoteScreen'

const sendControl = vi.fn()
const send = vi.fn()
const requestFullscreen = vi.fn(async () => undefined)
const requestWindows = vi.fn()
const remoteState: { status?: ScreenStatus; windowList?: ScreenWindowList } = {}
const targets: ScreenTarget[] = []

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useLocation: () => ({ state: null }),
    useNavigate: () => vi.fn(),
  }
})

vi.mock('../../desktops/DesktopContext', () => ({
  useConnection: () => ({
    pairing: { id: 'desktop-1', name: 'Mac' },
    tunnel: {},
    api: {
      listWorkspaces: vi.fn(async () => []),
      getSettings: vi.fn(async () => ({})),
      getComputerUseStatus: vi.fn(async () => ({ platform: 'darwin' })),
      wakeDisplay: vi.fn(async () => undefined),
    },
  }),
}))

vi.mock('../../desktops/DesktopSwitcher', () => ({
  DesktopSwitcher: () => <div>Mac</div>,
}))

vi.mock('../../i18n', () => {
  // Stable like the real context value, so effects keyed on it settle.
  const t = (key: string) =>
    ({
      'screen.fullscreen': 'Full screen',
      'screen.paste': 'Paste to Mac',
    })[key] ?? key
  return { useT: () => t }
})

vi.mock('./useRemoteScreen', () => ({
  useRemoteScreen: (_tunnel: unknown, target: ScreenTarget) => {
    targets.push(target)
    return {
      connected: true,
      markVideoFrame: vi.fn(),
      stalled: false,
      videoLive: false,
      control: true,
      error: '',
      frame: undefined,
      message: undefined,
      status: remoteState.status,
      windowList: remoteState.windowList,
      requestWindows,
      rtcState: 'idle',
      stream: undefined,
      send,
      sendControl,
      setControl: vi.fn(),
    }
  },
}))

beforeEach(() => {
  sendControl.mockClear()
  requestWindows.mockClear()
  remoteState.status = undefined
  remoteState.windowList = undefined
  targets.length = 0
  send.mockClear()
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
  requestFullscreen.mockClear()
  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
    configurable: true,
    value: requestFullscreen,
  })
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { readText: vi.fn(async () => 'from phone') },
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('RemoteScreen toolbar actions', () => {
  it('has no fullscreen or clipboard-push buttons until they work on device', () => {
    render(<RemoteScreen />)
    expect(screen.queryByRole('button', { name: 'Full screen' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Paste to Mac' })).toBeNull()
  })
})

describe('RemoteScreen zoom and input mode', () => {
  it('zooms from the chip, offers pan while zoomed, and resets to fit', () => {
    const { container } = render(<RemoteScreen />)
    const chip = screen.getByRole('button', { name: 'screen.zoomActual' })
    expect(chip.textContent).toBe('screen.zoomFit')
    expect(screen.queryByRole('button', { name: 'screen.panView' })).toBeNull()
    fireEvent.click(chip)
    const zoomedChip = screen.getByRole('button', { name: 'screen.zoomToFit' })
    expect(zoomedChip.textContent).toBe('200%')
    const layer = container.querySelector<HTMLElement>(
      '.remote-screen-transform',
    )
    expect(layer?.style.transform).toContain('scale(2)')
    const pan = screen.getByRole('button', { name: 'screen.panView' })
    fireEvent.click(pan)
    expect(pan.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(zoomedChip)
    expect(layer?.style.transform).toContain('scale(1)')
    expect(screen.queryByRole('button', { name: 'screen.panView' })).toBeNull()
  })

  it('shows the local cursor and hides the Mac pointer only in trackpad mode', () => {
    const { container } = render(<RemoteScreen />)
    expect(container.querySelector('.remote-screen-cursor')).toBeNull()
    expect(send).toHaveBeenLastCalledWith({ type: 'mouse_mode', on: false })
    fireEvent.click(screen.getByRole('button', { name: 'screen.trackpad' }))
    expect(container.querySelector('.remote-screen-cursor')).not.toBeNull()
    expect(send).toHaveBeenLastCalledWith({ type: 'mouse_mode', on: true })
    expect(localStorage.getItem('alma.screen.inputMode.desktop-1')).toBe(
      'trackpad',
    )
  })

  it('marks out the trackpad and fades its hint after the first touch', () => {
    const { container } = render(<RemoteScreen />)
    const surface = container.querySelector<HTMLElement>(
      '.remote-screen-surface',
    )!
    surface.setPointerCapture = vi.fn()
    expect(surface.classList.contains('is-trackpad')).toBe(false)
    expect(container.querySelector('.remote-screen-hint')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'screen.trackpad' }))
    expect(surface.classList.contains('is-trackpad')).toBe(true)
    const hint = container.querySelector('.remote-screen-hint')!
    expect(hint.textContent).toBe('screen.trackpadHint')
    expect(hint.classList.contains('is-seen')).toBe(false)
    fireEvent.pointerDown(surface, { pointerId: 1, pointerType: 'touch' })
    expect(hint.classList.contains('is-seen')).toBe(true)
    expect(localStorage.getItem('alma.screen.trackpadHintSeen')).toBe('1')
  })
})

describe('RemoteScreen window target', () => {
  const status = (extra: Partial<ScreenStatus> = {}): ScreenStatus => ({
    type: 'status',
    bound: true,
    displayId: 1,
    width: 1512,
    height: 982,
    scale: 2,
    mode: 'jpeg',
    windows: true,
    ...extra,
  })

  it('streams a picked window and falls back when it closes', () => {
    remoteState.status = status()
    remoteState.windowList = {
      windows: [
        { id: 7, app: 'Safari', title: 'Docs', width: 800, height: 600 },
      ],
    }
    const { rerender } = render(<RemoteScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'screen.picker.open' }))
    expect(requestWindows).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /Safari/ }))
    expect(targets.at(-1)).toEqual({ windowId: 7 })

    remoteState.status = status({ window: { id: 7, app: 'Safari' } })
    rerender(<RemoteScreen />)
    expect(screen.queryByText('screen.picker.windowClosed')).toBeNull()

    remoteState.status = status({ windowClosed: true })
    rerender(<RemoteScreen />)
    expect(screen.getByText('screen.picker.windowClosed')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'screen.picker.open' }))
    const whole = screen.getByRole('button', {
      name: 'screen.picker.wholeScreen',
    })
    expect(whole.getAttribute('aria-pressed')).toBe('true')
    // Picking the shown display drops the closed window from the target.
    fireEvent.click(whole)
    expect(targets.at(-1)).toEqual({})
  })

  it('hides the window-closed notice after a moment', () => {
    vi.useFakeTimers()
    try {
      remoteState.status = status({ windowClosed: true })
      render(<RemoteScreen />)
      expect(screen.getByText('screen.picker.windowClosed')).toBeTruthy()
      act(() => {
        vi.advanceTimersByTime(3_000)
      })
      expect(screen.queryByText('screen.picker.windowClosed')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('has no picker when there is nothing to choose', () => {
    remoteState.status = status({ windows: false })
    render(<RemoteScreen />)
    expect(
      screen.queryByRole('button', { name: 'screen.picker.open' }),
    ).toBeNull()
  })
})
