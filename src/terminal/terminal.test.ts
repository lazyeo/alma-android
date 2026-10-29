import { describe, expect, it, vi } from 'vitest'
import {
  HERDR_KEY_MAP,
  PTY_KEY_MAP,
  TerminalSession,
  calculateSnapshotFontSize,
  calculateSnapshotSize,
  loadSnapshotDisplayMode,
  prepareReflowSnapshot,
  saveSnapshotDisplayMode,
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
  it('rewrites grid frames in place without resetting xterm', () => {
    const driver = fakeDriver()
    const session = new TerminalSession(driver, {
      mode: 'snapshot',
      cols: 100,
      rows: 30,
    })

    expect(session.writeSnapshot('first\n第二行', 100, 30, 'grid')).toBe(true)
    expect(session.writeSnapshot('next', 80, 24, 'grid')).toBe(true)

    expect(driver.setInputEnabled).toHaveBeenCalledWith(false)
    expect(driver.resize).toHaveBeenNthCalledWith(1, 100, 30)
    expect(driver.resize).toHaveBeenNthCalledWith(2, 80, 24)
    expect(driver.reset).not.toHaveBeenCalled()
    expect(driver.write).toHaveBeenNthCalledWith(
      1,
      '\u001b[Hfirst\u001b[K\r\n第二行\u001b[K\u001b[J',
    )
    expect(driver.write).toHaveBeenNthCalledWith(
      2,
      '\u001b[Hnext\u001b[K\u001b[J',
    )
  })

  it('strips trailing spaces per reflow line while preserving ANSI', () => {
    expect(
      prepareReflowSnapshot('\u001b[31mred\u001b[0m   \nplain\t  \n'),
    ).toBe('\u001b[31mred\u001b[0m\r\nplain\r\n')
  })

  it('skips an identical frame in the same display mode and size', () => {
    const driver = fakeDriver()
    const session = new TerminalSession(driver, {
      mode: 'snapshot',
      cols: 80,
      rows: 24,
    })

    expect(session.writeSnapshot('same', 80, 24, 'reflow')).toBe(true)
    expect(session.writeSnapshot('same', 80, 24, 'reflow')).toBe(false)
    expect(driver.write).toHaveBeenCalledTimes(1)
  })

  it('clears before writing a reflow frame so wrapping can grow scrollback', () => {
    const driver = fakeDriver()
    const session = new TerminalSession(driver, {
      mode: 'snapshot',
      cols: 40,
      rows: 20,
    })

    session.writeSnapshot('long line   \nnext', 40, 20, 'reflow')

    expect(driver.write).toHaveBeenCalledWith(
      '\u001b[H\u001b[3J\u001b[2Jlong line\r\nnext',
    )
  })
})

describe('terminal sizing', () => {
  it('scales the grid font below the old minimum so the page never overflows', () => {
    expect(calculateSnapshotFontSize(320, 100)).toEqual({
      fontSize: 5.3,
      contentWidth: 318,
      overflows: false,
    })
  })

  it('calculates readable reflow columns and visible rows from the viewport', () => {
    expect(calculateSnapshotSize(320, 480, 'reflow')).toEqual({
      cols: 41,
      rows: 30,
      fontSize: 13,
      contentWidth: 320,
    })
  })

  it('uses source dimensions in grid mode', () => {
    expect(calculateSnapshotSize(320, 480, 'grid', 160, 40)).toEqual({
      cols: 160,
      rows: 40,
      fontSize: 3.3,
      contentWidth: 316,
    })
  })
})

describe('snapshot display mode persistence', () => {
  it('defaults to reflow and only restores valid values', () => {
    const storage = {
      getItem: vi.fn<() => string | null>(() => null),
      setItem: vi.fn(),
    }
    expect(loadSnapshotDisplayMode(storage)).toBe('reflow')
    storage.getItem.mockReturnValue('grid')
    expect(loadSnapshotDisplayMode(storage)).toBe('grid')
    storage.getItem.mockReturnValue('invalid')
    expect(loadSnapshotDisplayMode(storage)).toBe('reflow')
  })

  it('stores the selected display mode', () => {
    const storage = { getItem: vi.fn(), setItem: vi.fn() }
    saveSnapshotDisplayMode('grid', storage)
    expect(storage.setItem).toHaveBeenCalledWith(
      'alma.terminal.snapshotDisplayMode',
      'grid',
    )
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
    session.writeSnapshot('screen', 80, 24, 'grid')

    expect(driver.setInputEnabled).toHaveBeenLastCalledWith(false)
    expect(driver.write).toHaveBeenCalledTimes(1)
    expect(driver.write).toHaveBeenCalledWith('\u001b[Hscreen\u001b[K\u001b[J')
  })
})
