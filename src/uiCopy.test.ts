import { afterEach, describe, expect, it } from 'vitest'
import { setLanguage } from './i18n/runtime'
import { RelayConnectError } from './relay/relayDiagnosis'
import {
  desktopRowSecondary,
  formatDiffStats,
  formatLoopSchedule,
  humanConnectionError,
  humanErrorMessage,
} from './uiCopy'

describe('desktop row secondary copy', () => {
  it('reports current and exceptional connection state only', () => {
    expect(desktopRowSecondary('online', true)).toBe('Current desktop')
    expect(desktopRowSecondary('online', false)).toBeUndefined()
    expect(desktopRowSecondary('offline', false)).toBe('Offline')
    expect(
      desktopRowSecondary('offline', false, 'Relay connection failed'),
    ).toBe("Can't reach the relay")
    expect(
      desktopRowSecondary(
        'offline',
        false,
        'Request timed out waiting for desktop',
      ),
    ).toBe('Desktop not responding')
    expect(desktopRowSecondary('offline', false, 'HTTP 502: bad gateway')).toBe(
      'Offline',
    )
  })

  it('maps raw connection errors to plain language', () => {
    expect(humanConnectionError('Relay authentication failed')).toBe(
      "Can't reach the relay",
    )
    expect(humanConnectionError('Desktop request timeout')).toBe(
      'Desktop not responding',
    )
    expect(humanConnectionError('unknown internal detail')).toBe('Offline')
    expect(
      humanConnectionError(
        'relay.alma.now is reachable but refused the connection. A proxy or VPN may be blocking WebSockets.',
      ),
    ).toBe('Connection blocked')
    expect(
      humanConnectionError(
        'This relay uses http://, which the app blocks. Use an https relay.',
      ),
    ).toBe('Relay is not https')
  })
})

describe('natural count copy', () => {
  it('formats loop schedules with singular and plural runs', () => {
    expect(formatLoopSchedule('5m', 1)).toBe('Every 5m, 1 run')
    expect(formatLoopSchedule('5m', 12)).toBe('Every 5m, 12 runs')
  })

  it('formats diff stats with singular and plural files', () => {
    expect(formatDiffStats(12, 3, 1)).toBe('+12 −3 in 1 file')
    expect(formatDiffStats(12, 3, 4)).toBe('+12 −3 in 4 files')
  })
})

describe('primary error copy', () => {
  it('hides transport details and gives the next useful action', () => {
    expect(
      humanErrorMessage(new Error('HTTP 502 {\"error\":\"bad gateway\"}')),
    ).toBe('The service could not be reached. Try again.')
    expect(humanErrorMessage(new Error('Relay authentication failed'))).toBe(
      'The relay rejected the connection. Pair again if this continues.',
    )
    expect(humanErrorMessage('camera denied')).toBe(
      'Something went wrong. Try again.',
    )
  })
})

describe('Chinese copy', () => {
  afterEach(() => setLanguage('en'))

  it('follows the runtime language', () => {
    setLanguage('zh')
    expect(desktopRowSecondary('online', true)).toBe('当前桌面端')
    expect(humanConnectionError('Relay connection failed')).toBe('无法连接中继')
    expect(formatLoopSchedule('5m', 12)).toBe('每 5m，共 12 次')
    expect(formatDiffStats(12, 3, 4)).toBe('4 个文件 +12 −3')
    expect(humanErrorMessage('camera denied')).toBe('出了点问题，请重试。')
  })

  it('recognises relay failures stored in the other language', () => {
    setLanguage('zh')
    const stored = new RelayConnectError('blocked', 'relay.alma.now').message
    expect(stored).toBe(
      'relay.alma.now 可以访问，但拒绝了连接。可能是代理或 VPN 拦截了 WebSocket。',
    )
    setLanguage('en')
    expect(humanConnectionError(stored)).toBe('Connection blocked')
  })
})
