import { describe, expect, it, vi } from 'vitest'
import {
  HERDR_KEY_MAP,
  PTY_KEY_MAP,
  TerminalSession,
  calculateSnapshotFontSize,
  normalizeSnapshotText,
  type TerminalDriver,
} from './terminal'

function fakeDriver() {
  const driver: TerminalDriver = {
    reset: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    setFontSize: vi.fn(),
    setInputEnabled: vi.fn(),
    onData: vi.fn(() => () => undefined),
    dispose: vi.fn(),
  }
  return driver
}

describe('terminal key mappings', () => {
  it('maps abstract keys to Herdr pane key names', () => {
    expect(HERDR_KEY_MAP).toEqual({
      escape: 'esc',
      interrupt: 'ctrl+c',
      enter: 'enter',
      tab: 'tab',
      backtab: 'shift+tab',
      up: 'up',
      down: 'down',
      left: 'left',
      right: 'right',
      backspace: 'backspace',
    })
  })

  it('maps abstract keys to PTY byte sequences', () => {
    expect(PTY_KEY_MAP).toEqual({
      escape: '\u001b',
      interrupt: '\u0003',
      enter: '\r',
      tab: '\t',
      backtab: '\u001b[Z',
      up: '\u001b[A',
      down: '\u001b[B',
      left: '\u001b[D',
      right: '\u001b[C',
      backspace: '\u007f',
    })
  })
})

describe('snapshot terminal', () => {
  it('resets, sizes, and writes each complete screen frame', () => {
    const driver = fakeDriver()
    const session = new TerminalSession(driver, {
      mode: 'snapshot',
      cols: 100,
      rows: 30,
    })

    session.writeSnapshot('first\n第二行', 100, 30)
    session.writeSnapshot('next', 80, 24)

    expect(driver.setInputEnabled).toHaveBeenCalledWith(false)
    expect(driver.resize).toHaveBeenNthCalledWith(1, 100, 30)
    expect(driver.resize).toHaveBeenNthCalledWith(2, 80, 24)
    expect(driver.reset).toHaveBeenCalledTimes(2)
    expect(driver.write).toHaveBeenNthCalledWith(
      1,
      '\u001b[H\u001b[2Jfirst\r\n第二行',
    )
    expect(driver.write).toHaveBeenNthCalledWith(2, '\u001b[H\u001b[2Jnext')
  })

  it('normalizes lone line feeds without doubling CRLF', () => {
    expect(normalizeSnapshotText('a\nb\r\nc')).toBe('a\r\nb\r\nc')
  })
})

describe('terminal sizing', () => {
  it('scales the font down so fixed columns fit', () => {
    expect(calculateSnapshotFontSize(600, 100)).toEqual({
      fontSize: 10,
      contentWidth: 600,
      overflows: false,
    })
  })

  it('uses the minimum font size and requests horizontal scrolling', () => {
    expect(calculateSnapshotFontSize(320, 100)).toEqual({
      fontSize: 7,
      contentWidth: 420,
      overflows: true,
    })
  })
})

describe('terminal modes', () => {
  it('enables stream input, forwards bytes, and reports fit resizes', () => {
    const driver = fakeDriver()
    let dataHandler: ((data: string) => void) | undefined
    vi.mocked(driver.onData).mockImplementation((handler) => {
      dataHandler = handler
      return () => undefined
    })
    const onData = vi.fn()
    const onResize = vi.fn()
    const session = new TerminalSession(driver, {
      mode: 'stream',
      onData,
      onResize,
    })

    session.writeStream('chunk')
    dataHandler?.('typed')
    session.reportResize(120, 40)

    expect(driver.setInputEnabled).toHaveBeenCalledWith(true)
    expect(driver.write).toHaveBeenCalledWith('chunk')
    expect(onData).toHaveBeenCalledWith('typed')
    expect(onResize).toHaveBeenCalledWith({ cols: 120, rows: 40 })
  })

  it('switches modes without retaining stream input behavior', () => {
    const driver = fakeDriver()
    const session = new TerminalSession(driver, { mode: 'stream' })

    session.configure({ mode: 'snapshot', cols: 80, rows: 24 })
    session.writeStream('ignored')
    session.writeSnapshot('screen', 80, 24)

    expect(driver.setInputEnabled).toHaveBeenLastCalledWith(false)
    expect(driver.write).toHaveBeenCalledTimes(1)
    expect(driver.write).toHaveBeenCalledWith('\u001b[H\u001b[2Jscreen')
  })
})
