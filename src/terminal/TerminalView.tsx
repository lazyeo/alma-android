import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import {
  TERMINAL_THEME,
  TerminalSession,
  calculateSnapshotFontSize,
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

export function TerminalView(props: TerminalViewProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Xterm>()
  const fitRef = useRef<FitAddon>()
  const sessionRef = useRef<TerminalSession>()
  const lastStreamData = useRef('')
  const [ready, setReady] = useState(false)
  const [surfaceStyle, setSurfaceStyle] = useState<CSSProperties>()

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
        disableStdin: props.mode === 'snapshot',
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 13,
        lineHeight: 1.2,
        scrollback: props.mode === 'snapshot' ? 0 : 1000,
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
        props.mode === 'snapshot'
          ? {
              mode: 'snapshot',
              cols: props.frame?.cols ?? 80,
              rows: props.frame?.rows ?? 24,
            }
          : { mode: 'stream', onData: props.onData, onResize: props.onResize },
      )
      resizeObserver = new ResizeObserver(() => {
        if (props.mode === 'stream') {
          fit.fit()
          sessionRef.current?.reportResize(terminal.cols, terminal.rows)
        }
        setReady((value) => !value)
      })
      if (viewportRef.current) resizeObserver.observe(viewportRef.current)
      setReady(true)
    })
    return () => {
      cancelled = true
      resizeObserver?.disconnect()
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
        ? {
            mode: 'snapshot',
            cols: props.frame?.cols ?? 80,
            rows: props.frame?.rows ?? 24,
          }
        : { mode: 'stream', onData: props.onData, onResize: props.onResize },
    )
  }, [
    props.mode,
    props.mode === 'stream' ? props.onData : undefined,
    props.mode === 'stream' ? props.onResize : undefined,
  ])

  useLayoutEffect(() => {
    if (props.mode !== 'snapshot' || !ready) return
    const viewport = viewportRef.current
    const session = sessionRef.current
    const terminal = terminalRef.current
    if (!viewport || !session || !terminal) return
    const cols = props.frame?.cols ?? 80
    const rows = props.frame?.rows ?? 24
    const sizing = calculateSnapshotFontSize(viewport.clientWidth, cols)
    session.setFontSize(sizing.fontSize)
    setSurfaceStyle({ minWidth: sizing.contentWidth })
    session.writeSnapshot(
      props.frame?.text ?? props.waitingText ?? '',
      cols,
      rows,
    )
  }, [props, ready])

  useEffect(() => {
    if (props.mode !== 'stream' || !ready || !props.data) return
    if (props.data === lastStreamData.current) return
    lastStreamData.current = props.data
    sessionRef.current?.writeStream(props.data)
  }, [props, ready])

  return (
    <div
      ref={viewportRef}
      className={`terminal-viewport terminal-${props.mode}${props.className ? ` ${props.className}` : ''}`}
      role="region"
      aria-label={props.ariaLabel}
    >
      <div ref={surfaceRef} className="terminal-surface" style={surfaceStyle} />
    </div>
  )
}
