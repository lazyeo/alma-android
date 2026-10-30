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
    rtcState: 'idle',
    stream: undefined,
    send: vi.fn(),
    sendControl,
    setControl: vi.fn(),
  }),
}))

beforeEach(() => {
  sendControl.mockClear()
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
