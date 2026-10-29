import { memo, useEffect, useRef, useState } from 'react'
import {
  TERMINAL_THEME,
  TerminalSession,
  calculateSnapshotSize,
  type SnapshotDisplayMode,
  type TerminalDriver,
} from './terminal'

interface TerminalFrame {
  text: string
  cols: number
  rows: number
}

interface TerminalViewBaseProps {
  className?: string
  ariaLabel: string
}

export interface SnapshotTerminalViewProps extends TerminalViewBaseProps {
  mode: 'snapshot'
  displayMode: SnapshotDisplayMode
  frame?: TerminalFrame
  waitingText?: string
}

export interface StreamTerminalViewProps extends TerminalViewBaseProps {
  mode: 'stream'
  data?: string
  onData?: (data: string) => void
  onResize?: (size: { cols: number; rows: number }) => void
}

export type TerminalViewProps =
  SnapshotTerminalViewProps | StreamTerminalViewProps

type Xterm = import('@xterm/xterm').Terminal
type FitAddon = import('@xterm/addon-fit').FitAddon

type SnapshotJob = {
  text: string
  sourceCols: number
  sourceRows: number
  displayMode: SnapshotDisplayMode
}

const SNAPSHOT_FONT_SIZE = 13
const SNAPSHOT_LINE_HEIGHT = 1.2
const SURFACE_INSET = 20

function TerminalViewComponent(props: TerminalViewProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Xterm>()
  const fitRef = useRef<FitAddon>()
  const sessionRef = useRef<TerminalSession>()
  const lastStreamData = useRef('')
  const snapshotJobRef = useRef<SnapshotJob>()
  const frameRequestRef = useRef<number>()
  const resizeRequestRef = useRef<number>()
  const lastSizingRef = useRef('')
  const [ready, setReady] = useState(false)

  const propMode = props.mode
  const streamOnData = props.mode === 'stream' ? props.onData : undefined
  const streamOnResize = props.mode === 'stream' ? props.onResize : undefined

  useEffect(() => {
    let cancelled = false
    let resizeObserver: ResizeObserver | undefined
    void Promise.all([
      import('@xterm/xterm'),
      import('@xterm/addon-fit'),
      import('@xterm/addon-unicode11'),
      import('@xterm/xterm/css/xterm.css'),
    ]).then(([{ Terminal }, { FitAddon }, { Unicode11Addon }]) => {
      if (cancelled || !surfaceRef.current) return
      const terminal = new Terminal({
        allowProposedApi: true,
        convertEol: false,
        cursorBlink: false,
        cursorStyle: 'block',
        disableStdin: propMode === 'snapshot',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: SNAPSHOT_FONT_SIZE,
        lineHeight: SNAPSHOT_LINE_HEIGHT,
        scrollback: propMode === 'snapshot' ? 1200 : 1000,
        theme: TERMINAL_THEME,
      })
      const unicode = new Unicode11Addon()
      terminal.loadAddon(unicode)
      terminal.unicode.activeVersion = '11'
      const fit = new FitAddon()
      terminal.loadAddon(fit)
      terminal.open(surfaceRef.current)
      const driver: TerminalDriver = {
        reset: () => terminal.reset(),
        write: (data) => terminal.write(data),
        resize: (cols, rows) => terminal.resize(cols, rows),
        setFontSize: (fontSize) => {
          if (terminal.options.fontSize !== fontSize)
            terminal.options.fontSize = fontSize
        },
        setInputEnabled: (enabled) => {
          terminal.options.disableStdin = !enabled
        },
        onData: (handler) => terminal.onData(handler).dispose,
        dispose: () => terminal.dispose(),
      }
      terminalRef.current = terminal
      fitRef.current = fit
      sessionRef.current = new TerminalSession(
        driver,
        propMode === 'snapshot'
          ? { mode: 'snapshot', cols: 80, rows: 24 }
          : {
              mode: 'stream',
              onData: streamOnData,
              onResize: streamOnResize,
            },
      )
      resizeObserver = new ResizeObserver(() => {
        if (resizeRequestRef.current !== undefined)
          cancelAnimationFrame(resizeRequestRef.current)
        resizeRequestRef.current = requestAnimationFrame(() => {
          resizeRequestRef.current = undefined
          if (propMode === 'stream') {
            fit.fit()
            sessionRef.current?.reportResize(terminal.cols, terminal.rows)
          } else {
            scheduleSnapshotWrite()
          }
        })
      })
      if (viewportRef.current) resizeObserver.observe(viewportRef.current)
      setReady(true)
    })
    return () => {
      cancelled = true
      resizeObserver?.disconnect()
      if (resizeRequestRef.current !== undefined)
        cancelAnimationFrame(resizeRequestRef.current)
      if (frameRequestRef.current !== undefined)
        cancelAnimationFrame(frameRequestRef.current)
      sessionRef.current?.dispose()
      terminalRef.current = undefined
      fitRef.current = undefined
      sessionRef.current = undefined
    }
    // Xterm owns this DOM node for the lifetime of the component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const session = sessionRef.current
    if (!session) return
    session.configure(
      props.mode === 'snapshot'
        ? { mode: 'snapshot', cols: 80, rows: 24 }
        : { mode: 'stream', onData: props.onData, onResize: props.onResize },
    )
  }, [props.mode, streamOnData, streamOnResize, ready])

  const frameText = props.mode === 'snapshot' ? props.frame?.text : undefined
  const frameCols = props.mode === 'snapshot' ? props.frame?.cols : undefined
  const frameRows = props.mode === 'snapshot' ? props.frame?.rows : undefined
  const displayMode = props.mode === 'snapshot' ? props.displayMode : undefined
  const waitingText = props.mode === 'snapshot' ? props.waitingText : undefined

  useEffect(() => {
    if (props.mode !== 'snapshot' || !ready || !displayMode) return
    snapshotJobRef.current = {
      text: frameText ?? waitingText ?? '',
      sourceCols: frameCols ?? 80,
      sourceRows: frameRows ?? 24,
      displayMode,
    }
    scheduleSnapshotWrite()
    // Primitive frame fields prevent composer renders from rewriting xterm.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayMode, frameCols, frameRows, frameText, ready, waitingText])

  useEffect(() => {
    if (props.mode !== 'stream' || !ready || !props.data) return
    if (props.data === lastStreamData.current) return
    lastStreamData.current = props.data
    sessionRef.current?.writeStream(props.data)
  }, [props.mode, props.mode === 'stream' ? props.data : undefined, ready])

  function scheduleSnapshotWrite() {
    if (frameRequestRef.current !== undefined) return
    frameRequestRef.current = requestAnimationFrame(() => {
      frameRequestRef.current = undefined
      const viewport = viewportRef.current
      const surface = surfaceRef.current
      const terminal = terminalRef.current
      const session = sessionRef.current
      const job = snapshotJobRef.current
      if (!viewport || !surface || !terminal || !session || !job) return

      const width = Math.max(1, surface.clientWidth - SURFACE_INSET)
      const height = Math.max(1, surface.clientHeight - SURFACE_INSET)
      let sizing = calculateSnapshotSize(
        width,
        height,
        job.displayMode,
        job.sourceCols,
        job.sourceRows,
      )
      session.setFontSize(sizing.fontSize)
      if (job.displayMode === 'reflow') {
        const proposed = fitRef.current?.proposeDimensions()
        if (proposed)
          sizing = {
            ...sizing,
            cols: proposed.cols,
            rows: proposed.rows,
          }
      }
      const sizingKey = `${job.displayMode}:${sizing.cols}x${sizing.rows}:${sizing.fontSize}`
      if (sizingKey !== lastSizingRef.current) {
        lastSizingRef.current = sizingKey
        viewport.dataset.displayMode = job.displayMode
        viewport.style.setProperty(
          '--terminal-content-width',
          `${sizing.contentWidth}px`,
        )
      }

      const buffer = terminal.buffer.active
      const pinned = buffer.viewportY >= buffer.baseY
      const previousViewportY = buffer.viewportY
      const wrote = session.writeSnapshot(
        job.text,
        sizing.cols,
        sizing.rows,
        job.displayMode,
      )
      if (!wrote) return
      terminal.write('', () => {
        if (pinned) terminal.scrollToBottom()
        else terminal.scrollToLine(previousViewportY)
      })
    })
  }

  return (
    <div
      ref={viewportRef}
      className={`terminal-viewport terminal-${props.mode}${props.className ? ` ${props.className}` : ''}`}
      role="region"
      aria-label={props.ariaLabel}
      data-sidebar-swipe-exclude={
        props.mode === 'snapshot' && props.displayMode === 'grid'
          ? ''
          : undefined
      }
    >
      <div ref={surfaceRef} className="terminal-surface" />
    </div>
  )
}

function equalTerminalViewProps(
  previous: TerminalViewProps,
  next: TerminalViewProps,
) {
  if (
    previous.mode !== next.mode ||
    previous.className !== next.className ||
    previous.ariaLabel !== next.ariaLabel
  )
    return false
  if (previous.mode === 'snapshot' && next.mode === 'snapshot')
    return (
      previous.displayMode === next.displayMode &&
      previous.waitingText === next.waitingText &&
      previous.frame?.text === next.frame?.text &&
      previous.frame?.cols === next.frame?.cols &&
      previous.frame?.rows === next.frame?.rows
    )
  if (previous.mode === 'stream' && next.mode === 'stream')
    return (
      previous.data === next.data &&
      previous.onData === next.onData &&
      previous.onResize === next.onResize
    )
  return false
}

export const TerminalView = memo(TerminalViewComponent, equalTerminalViewProps)
