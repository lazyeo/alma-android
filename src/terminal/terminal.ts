export type TerminalMode = 'snapshot' | 'stream'

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

const SNAPSHOT_PREFIX = '\u001b[H\u001b[2J'
const DEFAULT_FONT_SIZE = 13
const MIN_FONT_SIZE = 7
const CELL_WIDTH_EM = 0.6

export function normalizeSnapshotText(text: string) {
  return text.replace(/(^|[^\r])\n/g, '$1\r\n')
}

export function calculateSnapshotFontSize(
  availableWidth: number,
  cols: number,
  defaultFontSize = DEFAULT_FONT_SIZE,
  minFontSize = MIN_FONT_SIZE,
) {
  const safeCols = Math.max(1, cols)
  const fitted = availableWidth / (safeCols * CELL_WIDTH_EM)
  const fontSize = Math.max(minFontSize, Math.min(defaultFontSize, fitted))
  const contentWidth = Math.ceil(safeCols * fontSize * CELL_WIDTH_EM)
  return {
    fontSize: Math.round(fontSize * 10) / 10,
    contentWidth,
    overflows: contentWidth > availableWidth,
  }
}

export class TerminalSession {
  private options: TerminalOptions
  private disposeData?: () => void

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

  writeSnapshot(text: string, cols: number, rows: number) {
    if (this.options.mode !== 'snapshot') return
    this.driver.resize(cols, rows)
    this.driver.reset()
    this.driver.write(`${SNAPSHOT_PREFIX}${normalizeSnapshotText(text)}`)
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
