// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoteScreen } from './RemoteScreen'

const sendControl = vi.fn()
const send = vi.fn()
const requestFullscreen = vi.fn(async () => undefined)

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

vi.mock('../../i18n', () => ({
  useT: () => (key: string) =>
    ({
      'screen.fullscreen': 'Full screen',
      'screen.paste': 'Paste to Mac',
    })[key] ?? key,
}))

vi.mock('./useRemoteScreen', () => ({
  useRemoteScreen: () => ({
    connected: true,
    markVideoFrame: vi.fn(),
    stalled: false,
    videoLive: false,
    control: true,
    error: '',
    frame: undefined,
    message: undefined,
    status: undefined,
    rtcState: 'idle',
    stream: undefined,
    send,
    sendControl,
    setControl: vi.fn(),
  }),
}))

beforeEach(() => {
  sendControl.mockClear()
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
})
