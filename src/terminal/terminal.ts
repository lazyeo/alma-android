export type TerminalMode = 'snapshot' | 'stream'
export type SnapshotDisplayMode = 'reflow' | 'grid'

export const SNAPSHOT_DISPLAY_MODE_KEY = 'alma.terminal.snapshotDisplayMode'
export const TERMINAL_COMPOSER_MODE_KEY = 'alma.herdr.terminalComposerMode'
export type TerminalComposerMode = 'message' | 'terminal'

export type TerminalKey =
  | 'escape'
  | 'interrupt'
  | 'enter'
  | 'tab'
  | 'backtab'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'backspace'

export const HERDR_KEY_MAP: Record<TerminalKey, string> = {
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
}

export const PTY_KEY_MAP: Record<TerminalKey, string> = {
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
}

export const TERMINAL_THEME = {
  background: '#1e1f24',
  foreground: '#d4d6dc',
  cursor: '#d4d6dc',
  cursorAccent: '#1e1f24',
  selectionBackground: '#5c637066',
  black: '#1e1f24',
  red: '#e06c75',
  green: '#98c379',
  yellow: '#e5c07b',
  blue: '#61afef',
  magenta: '#c678dd',
  cyan: '#56b6c2',
  white: '#c8ccd4',
  brightBlack: '#5c6370',
  brightRed: '#ef8891',
  brightGreen: '#b5e09b',
  brightYellow: '#f2d49b',
  brightBlue: '#8cc8ff',
  brightMagenta: '#dda5ef',
  brightCyan: '#7fd4de',
  brightWhite: '#ffffff',
} as const

export interface SnapshotTerminalOptions {
  mode: 'snapshot'
  cols: number
  rows: number
}

export interface StreamTerminalOptions {
  mode: 'stream'
  onData?: (data: string) => void
  onResize?: (size: { cols: number; rows: number }) => void
}

export type TerminalOptions = SnapshotTerminalOptions | StreamTerminalOptions

export interface TerminalDriver {
  reset(): void
  write(data: string): void
  resize(cols: number, rows: number): void
  setFontSize(fontSize: number): void
  setInputEnabled(enabled: boolean): void
  onData(handler: (data: string) => void): () => void
  dispose(): void
}

const DEFAULT_FONT_SIZE = 13
const MIN_GRID_FONT_SIZE = 11
const CELL_WIDTH_EM = 0.6
const LINE_HEIGHT = 1.2

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

export function loadSnapshotDisplayMode(
  storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage ===
  'undefined'
    ? undefined
    : localStorage,
): SnapshotDisplayMode {
  try {
    return storage?.getItem(SNAPSHOT_DISPLAY_MODE_KEY) === 'grid'
      ? 'grid'
      : 'reflow'
  } catch {
    return 'reflow'
  }
}

export function loadTerminalComposerMode(
  storage: Pick<Storage, 'getItem'> | undefined = typeof localStorage ===
  'undefined'
    ? undefined
    : localStorage,
): TerminalComposerMode {
  try {
    return storage?.getItem(TERMINAL_COMPOSER_MODE_KEY) === 'terminal'
      ? 'terminal'
      : 'message'
  } catch {
    return 'message'
  }
}

export function saveTerminalComposerMode(
  mode: TerminalComposerMode,
  storage: Pick<StorageLike, 'setItem'> | undefined = typeof localStorage ===
  'undefined'
    ? undefined
    : localStorage,
) {
  try {
    storage?.setItem(TERMINAL_COMPOSER_MODE_KEY, mode)
  } catch {
    // Persistence is optional in restricted WebViews.
  }
}

export function saveSnapshotDisplayMode(
  mode: SnapshotDisplayMode,
  storage: Pick<StorageLike, 'setItem'> | undefined = typeof localStorage ===
  'undefined'
    ? undefined
    : localStorage,
) {
  try {
    storage?.setItem(SNAPSHOT_DISPLAY_MODE_KEY, mode)
  } catch {
    // Persistence is optional in restricted WebViews.
  }
}

const terminalLines = (text: string) => text.replace(/\r\n/g, '\n').split('\n')

const plainLine = (line: string) =>
  line
    .replace(/\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)/g, '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b./g, '')
    .replace(/\s+/g, ' ')
    .trim()

/**
 * Splits `recent` scrollback into the part above the live screen. The live
 * screen may be wrapped differently (recent_unwrapped) or a frame newer, so
 * overlap is found by locating the screen's first meaningful line in the
 * scrollback instead of requiring an exact tail match.
 */
export function mergeTerminalHistory(recent: string, visible: string) {
  const recentLines = terminalLines(recent)
  const visibleLines = terminalLines(visible).map(plainLine)
  const recentPlain = recentLines.map(plainLine)
  const anchor = visibleLines.find((line) => line.length >= 4)
  let cut = -1
  if (anchor) {
    const head = anchor.slice(0, 48)
    for (let index = recentPlain.length - 1; index >= 0; index -= 1) {
      if (recentPlain[index].includes(head)) {
        cut = index
        break
      }
    }
  }
  if (cut < 0)
    cut = Math.max(0, recentLines.length - visibleLines.filter(Boolean).length)
  const historyLines = recentLines.slice(0, cut)
  while (historyLines.length && plainLine(historyLines.at(-1) ?? '') === '')
    historyLines.pop()
  while (historyLines.length && plainLine(historyLines[0]) === '')
    historyLines.shift()
  const text = historyLines.join('\n')
  return { text, hasEarlier: text.length > 0 }
}

export function prepareReflowSnapshot(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[\t ]+$/g, ''))
    .join('\r\n')
}

function prepareGridSnapshot(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => `${line}\u001b[K`)
    .join('\r\n')
}

export function calculateSnapshotFontSize(
  availableWidth: number,
  cols: number,
  defaultFontSize = DEFAULT_FONT_SIZE,
  minFontSize = MIN_GRID_FONT_SIZE,
) {
  const safeWidth = Math.max(1, availableWidth)
  const safeCols = Math.max(1, cols)
  const fitted = safeWidth / (safeCols * CELL_WIDTH_EM)
  const fontSize = Math.max(minFontSize, Math.min(defaultFontSize, fitted))
  const roundedFontSize = Math.floor(fontSize * 10) / 10
  const contentWidth = Math.floor(safeCols * roundedFontSize * CELL_WIDTH_EM)
  return {
    fontSize: roundedFontSize,
    contentWidth,
    overflows: contentWidth > safeWidth,
  }
}

export function calculateSnapshotSize(
  availableWidth: number,
  availableHeight: number,
  mode: SnapshotDisplayMode,
  sourceCols = 80,
  sourceRows = 24,
) {
  const safeWidth = Math.max(1, availableWidth)
  const safeHeight = Math.max(1, availableHeight)
  if (mode === 'grid') {
    const sizing = calculateSnapshotFontSize(safeWidth, sourceCols)
    return {
      cols: Math.max(1, sourceCols),
      rows: Math.max(1, sourceRows),
      fontSize: sizing.fontSize,
      contentWidth: sizing.contentWidth,
    }
  }
  const fontSize = DEFAULT_FONT_SIZE
  return {
    cols: Math.max(2, Math.floor(safeWidth / (fontSize * CELL_WIDTH_EM))),
    rows: Math.max(1, Math.floor(safeHeight / (fontSize * LINE_HEIGHT))),
    fontSize,
    contentWidth: safeWidth,
  }
}

export class TerminalSession {
  private options: TerminalOptions
  private disposeData?: () => void
  private lastSnapshotKey = ''
  private lastSnapshotSize = ''

  constructor(
    private readonly driver: TerminalDriver,
    options: TerminalOptions,
  ) {
    this.options = options
    this.applyMode()
  }

  configure(options: TerminalOptions) {
    this.options = options
    this.applyMode()
  }

  writeSnapshot(
    text: string,
    cols: number,
    rows: number,
    displayMode: SnapshotDisplayMode,
  ) {
    if (this.options.mode !== 'snapshot') return false
    const key = `${displayMode}\u0000${cols}x${rows}\u0000${text}`
    if (key === this.lastSnapshotKey) return false
    this.lastSnapshotKey = key
    const sizeKey = `${cols}x${rows}`
    if (sizeKey !== this.lastSnapshotSize) {
      this.lastSnapshotSize = sizeKey
      this.driver.resize(cols, rows)
    }
    const prepared =
      displayMode === 'reflow'
        ? prepareReflowSnapshot(text)
        : prepareGridSnapshot(text)
    const output =
      displayMode === 'grid'
        ? `\u001b[H${prepared}\u001b[J`
        : `\u001b[H\u001b[3J\u001b[2J${prepared}`
    this.driver.write(output)
    return true
  }

  writeStream(data: string) {
    if (this.options.mode === 'stream') this.driver.write(data)
  }

  setFontSize(fontSize: number) {
    this.driver.setFontSize(fontSize)
  }

  reportResize(cols: number, rows: number) {
    if (this.options.mode === 'stream') this.options.onResize?.({ cols, rows })
  }

  dispose() {
    this.disposeData?.()
    this.driver.dispose()
  }

  private applyMode() {
    this.disposeData?.()
    this.disposeData = undefined
    const stream = this.options.mode === 'stream'
    this.driver.setInputEnabled(stream)
    if (stream)
      this.disposeData = this.driver.onData((data) => {
        if (this.options.mode === 'stream') this.options.onData?.(data)
      })
  }
}
