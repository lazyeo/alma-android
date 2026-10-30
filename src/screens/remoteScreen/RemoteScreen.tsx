import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  ChevronLeft,
  ClipboardPaste,
  Keyboard,
  Maximize2,
  Monitor,
  MonitorOff,
  MousePointer2,
  Send,
  TriangleAlert,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { copyText } from '../../clipboard'
import { useConnection } from '../../desktops/DesktopContext'
import { DesktopSwitcher } from '../../desktops/DesktopSwitcher'
import { useDesktopPlatform } from '../../desktops/platform'
import { useT } from '../../i18n'
import {
  buildKeyCombo,
  createMoveCoalescer,
  mapClientPoint,
  reduceTrackpadGesture,
  type ControlEvent,
  type KeyModifiers,
  type TrackpadState,
  type ViewTransform,
} from './controls'
import {
  rememberScreenUnavailable,
  screenUnavailableFromStatus,
  UNSUPPORTED_OS,
  unavailableCopy,
} from './availability'
import { BLANK_POSTER, isDarkSample } from './liveness'
import { useRemoteScreen } from './useRemoteScreen'
import { selectLocalWakeWorkspace } from './wakeDisplay'
import './remoteScreen.css'

type InputMode = 'direct' | 'trackpad'

// DOM key name → copy key under `screen.*` (and the key sent to the Mac).
const SPECIAL_KEYS = {
  Escape: 'esc',
  Tab: 'tab',
  Enter: 'enter',
  Backspace: 'backspace',
  ArrowLeft: 'left',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowRight: 'right',
} as const

const MODIFIERS = [
  ['meta', '⌘', 'modifierCommand'],
  ['alt', '⌥', 'modifierOption'],
  ['ctrl', '⌃', 'modifierControl'],
  ['shift', '⇧', 'modifierShift'],
] as const

function ScreenCanvas({
  data,
  onDark,
}: {
  data?: string
  onDark?: (dark: boolean) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const decodeVersion = useRef(0)
  useEffect(() => {
    if (!data) return
    const version = ++decodeVersion.current
    let disposed = false
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
    const blob = new Blob([bytes], { type: 'image/jpeg' })
    void createImageBitmap(blob)
      .then((bitmap) => {
        if (disposed || version !== decodeVersion.current) {
          bitmap.close()
          return
        }
        const canvas = canvasRef.current
        if (!canvas) return
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        canvas.getContext('2d')?.drawImage(bitmap, 0, 0)
        if (onDark) {
          // A sleeping or locked display often captures as a black frame.
          const probe = document.createElement('canvas')
          probe.width = 16
          probe.height = 10
          const context = probe.getContext('2d', { willReadFrequently: true })
          context?.drawImage(bitmap, 0, 0, 16, 10)
          const sample = context?.getImageData(0, 0, 16, 10).data
          if (sample) onDark(isDarkSample(sample))
        }
        bitmap.close()
      })
      .catch(() => undefined)
    return () => {
      disposed = true
    }
    // onDark is a stable state setter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])
  return <canvas ref={canvasRef} className="remote-screen-media" />
}

function ScreenMedia({
  stream,
  frame,
  videoLive,
  onVideoFrame,
  onDark,
}: {
  stream?: MediaStream
  frame?: { data: string }
  videoLive: boolean
  onVideoFrame: () => void
  onDark: (dark: boolean) => void
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    video.srcObject = stream ?? null
    if (!stream) return
    // `playing` alone can fire before any frame; wait for real dimensions.
    const check = () => {
      if (video.videoWidth > 0) onVideoFrame()
    }
    video.addEventListener('loadeddata', check)
    video.addEventListener('playing', check)
    video.addEventListener('resize', check)
    return () => {
      video.removeEventListener('loadeddata', check)
      video.removeEventListener('playing', check)
      video.removeEventListener('resize', check)
    }
  }, [stream, onVideoFrame])
  // The last JPEG frame stays underneath until video actually has a picture.
  return (
    <>
      <ScreenCanvas
        data={frame?.data}
        onDark={videoLive ? undefined : onDark}
      />
      {stream ? (
        <video
          ref={videoRef}
          className={`remote-screen-media remote-screen-video${videoLive ? ' live' : ''}`}
          poster={BLANK_POSTER}
          autoPlay
          playsInline
          muted
        />
      ) : null}
    </>
  )
}

export function RemoteScreen() {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const { pairing, tunnel, api } = useConnection()
  const remote = useRemoteScreen(tunnel)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const videoSize = useMemo(
    () =>
      remote.message?.type === 'status'
        ? { width: remote.message.width, height: remote.message.height }
        : remote.frame
          ? { width: remote.frame.width, height: remote.frame.height }
          : { width: 16, height: 10 },
    [remote.frame, remote.message],
  )
  const [inputMode, setInputMode] = useState<InputMode>('direct')
  const [statsOpen, setStatsOpen] = useState(false)
  const [dark, setDark] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [text, setText] = useState('')
  const [composing, setComposing] = useState(false)
  const [notice, setNotice] = useState('')
  const [wakeWorkspaceId, setWakeWorkspaceId] = useState<string>()
  const [wakeState, setWakeState] = useState<
    'loading' | 'ready' | 'pending' | 'success' | 'error'
  >('loading')
  const [modifiers, setModifiers] = useState<KeyModifiers>({})
  const [transform, setTransform] = useState<ViewTransform>({
    scale: 1,
    x: 0,
    y: 0,
  })
  const transformRef = useRef(transform)
  transformRef.current = transform
  const trackpadRef = useRef<TrackpadState>({
    cursor: { x: 0.5, y: 0.5 },
    phase: 'idle',
  })
  const [cursor, setCursor] = useState(trackpadRef.current.cursor)
  const pointers = useRef(new Map<number, { x: number; y: number }>())
  const gesture = useRef<{
    startX: number
    startY: number
    lastX: number
    lastY: number
    startAt: number
    moved: boolean
    longPress?: ReturnType<typeof setTimeout>
    pinchDistance?: number
    startScale?: number
  }>()
  const frameTimes = useRef<number[]>([])
  const [fps, setFps] = useState(0)
  const [frameAge, setFrameAge] = useState(0)

  useEffect(() => {
    let current = true
    void Promise.all([api.listWorkspaces(), api.getSettings()])
      .then(([workspaces, settings]) => {
        if (!current) return
        const workspace = selectLocalWakeWorkspace(
          workspaces,
          settings.general?.defaultWorkspaceId,
        )
        setWakeWorkspaceId(workspace?.id)
        setWakeState('ready')
      })
      .catch(() => {
        if (current) setWakeState('error')
      })
    return () => {
      current = false
    }
  }, [api])

  useEffect(() => {
    if (!remote.frame) return
    const now = performance.now()
    frameTimes.current.push(now)
    frameTimes.current = frameTimes.current.filter((time) => now - time <= 1000)
    setFps(frameTimes.current.length)
    setFrameAge(0)
    const timer = setInterval(() => setFrameAge((age) => age + 250), 250)
    return () => clearInterval(timer)
  }, [remote.frame])

  useEffect(() => {
    if (remote.message?.type !== 'clipboard') return
    void copyText(remote.message.text)
      .then(() => setNotice(t('screen.copiedFromMac')))
      .catch(() => setNotice(t('screen.clipboardFailed')))
  }, [remote.message, t])

  const moveCoalescer = useMemo(
    () => createMoveCoalescer<ControlEvent>(remote.sendControl, 33),
    [remote.sendControl],
  )
  useEffect(() => () => moveCoalescer.close(), [moveCoalescer])

  const updateTrackpad = useCallback(
    (event: Parameters<typeof reduceTrackpadGesture>[1]) => {
      const result = reduceTrackpadGesture(trackpadRef.current, event)
      trackpadRef.current = result.state
      setCursor(result.state.cursor)
      for (const output of result.events)
        output.type === 'pointer' && output.action === 'move'
          ? moveCoalescer.push(output)
          : remote.sendControl(output)
    },
    [moveCoalescer, remote],
  )

  const mappedPoint = useCallback(
    (x: number, y: number) => {
      const surface = surfaceRef.current
      if (!surface) return
      const rect = surface.getBoundingClientRect()
      return mapClientPoint(
        { x: x - rect.left, y: y - rect.top },
        { width: rect.width, height: rect.height },
        videoSize,
        transformRef.current,
      )
    },
    [videoSize],
  )

  const onPointerDown = (event: ReactPointerEvent) => {
    event.currentTarget.setPointerCapture(event.pointerId)
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    const points = [...pointers.current.values()]
    if (points.length === 2) {
      gesture.current = {
        startX: 0,
        startY: 0,
        lastX: 0,
        lastY: 0,
        startAt: Date.now(),
        moved: false,
        pinchDistance: Math.hypot(
          points[1].x - points[0].x,
          points[1].y - points[0].y,
        ),
        startScale: transformRef.current.scale,
      }
      return
    }
    gesture.current = {
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startAt: Date.now(),
      moved: false,
    }
    if (remote.control && inputMode === 'trackpad')
      gesture.current.longPress = setTimeout(
        () => updateTrackpad({ type: 'drag-start' }),
        450,
      )
  }

  const onPointerMove = (event: ReactPointerEvent) => {
    const previous = pointers.current.get(event.pointerId)
    if (!previous) return
    pointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    })
    const points = [...pointers.current.values()]
    const current = gesture.current
    if (!current) return
    if (points.length === 2 && current.pinchDistance && current.startScale) {
      const distance = Math.hypot(
        points[1].x - points[0].x,
        points[1].y - points[0].y,
      )
      setTransform((value) => ({
        ...value,
        scale: Math.min(
          4,
          Math.max(
            1,
            current.startScale! * (distance / current.pinchDistance!),
          ),
        ),
      }))
      current.moved = true
      return
    }
    const dx = event.clientX - current.lastX
    const dy = event.clientY - current.lastY
    current.lastX = event.clientX
    current.lastY = event.clientY
    if (
      Math.hypot(
        event.clientX - current.startX,
        event.clientY - current.startY,
      ) > 4
    )
      current.moved = true
    if (!remote.control) {
      if (transformRef.current.scale > 1)
        setTransform((value) => ({
          ...value,
          x: value.x + dx,
          y: value.y + dy,
        }))
      return
    }
    if (inputMode === 'trackpad') {
      updateTrackpad({ type: 'move', dx, dy, sensitivity: 0.002 })
      return
    }
    const mapped = mappedPoint(event.clientX, event.clientY)
    if (mapped?.inside)
      moveCoalescer.push({
        type: 'pointer',
        action: 'move',
        x: mapped.x,
        y: mapped.y,
      })
  }

  const onPointerUp = (event: ReactPointerEvent) => {
    const current = gesture.current
    const pointerCount = pointers.current.size
    pointers.current.delete(event.pointerId)
    if (!current) return
    if (current.longPress) clearTimeout(current.longPress)
    if (!remote.control) return
    if (inputMode === 'trackpad') {
      if (trackpadRef.current.phase === 'dragging')
        updateTrackpad({ type: 'drag-end' })
      else if (!current.moved)
        updateTrackpad({ type: 'tap', fingers: pointerCount >= 2 ? 2 : 1 })
      return
    }
    if (!current.moved) {
      const mapped = mappedPoint(event.clientX, event.clientY)
      if (mapped?.inside)
        remote.sendControl({
          type: 'pointer',
          action: 'click',
          x: mapped.x,
          y: mapped.y,
        })
    }
  }

  const onWheel = (event: React.WheelEvent) => {
    if (!remote.control || inputMode !== 'trackpad') return
    event.preventDefault()
    updateTrackpad({ type: 'scroll', dx: event.deltaX, dy: event.deltaY })
  }

  const sendText = (event?: FormEvent) => {
    event?.preventDefault()
    if (composing || !text.trim()) return
    remote.sendControl({ type: 'text', text })
    setText('')
  }

  const sendKey = (key: string) => {
    remote.sendControl({ type: 'key', key: buildKeyCombo(modifiers, key) })
  }

  const pasteToMac = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText()
      if (clipboardText)
        remote.sendControl({
          type: 'clipboard',
          text: clipboardText,
          paste: true,
        })
    } catch {
      setNotice(t('screen.clipboardFailed'))
    }
  }

  const wakeDisplay = async () => {
    if (!wakeWorkspaceId || wakeState === 'pending') return
    setWakeState('pending')
    try {
      await api.wakeDisplay(wakeWorkspaceId)
      setWakeState('success')
    } catch {
      setWakeState('error')
    }
  }

  const status = remote.message?.type === 'status' ? remote.message : undefined
  const platform = useDesktopPlatform(pairing.id, api)
  const unavailable =
    screenUnavailableFromStatus(status) ??
    (platform && platform !== 'darwin' ? UNSUPPORTED_OS : undefined)
  useEffect(() => {
    if (status)
      rememberScreenUnavailable(pairing.id, screenUnavailableFromStatus(status))
  }, [pairing.id, status])

  return (
    <section className="remote-screen-page">
      <header className="remote-screen-header">
        <button
          className="quiet-icon-button"
          aria-label={t('screen.back')}
          onClick={() => {
            const origin = (location.state as { screenOrigin?: string } | null)
              ?.screenOrigin
            navigate(origin ?? `/d/${encodeURIComponent(pairing.id)}/agents`, {
              replace: true,
            })
          }}
        >
          <ChevronLeft size={22} />
        </button>
        <div className="remote-screen-heading">
          <strong>{t('screen.title')}</strong>
          <DesktopSwitcher className="remote-screen-desktop-switcher" />
        </div>
        <button
          className="chip-button"
          aria-pressed={remote.control}
          disabled={Boolean(unavailable)}
          onClick={() => remote.setControl(!remote.control)}
        >
          <MousePointer2 size={14} />
          {remote.control ? t('screen.viewOnly') : t('screen.control')}
        </button>
      </header>

      {remote.control ? (
        <div className="remote-control-indicator">
          <span className="remote-control-pulse" />
          <strong>{t('screen.controlling')}</strong>
          <span>{t('screen.controlWarning')}</span>
        </div>
      ) : null}

      <div
        ref={surfaceRef}
        className={`remote-screen-surface ${remote.control ? 'is-controlling' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
      >
        <div
          className="remote-screen-transform"
          style={{
            transform: `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`,
          }}
        >
          <ScreenMedia
            stream={remote.stream}
            frame={remote.frame}
            videoLive={remote.videoLive}
            onVideoFrame={remote.markVideoFrame}
            onDark={setDark}
          />
        </div>
        {unavailable ? (
          <div
            className="remote-screen-empty remote-screen-asleep"
            role="alert"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <TriangleAlert size={28} />
            <strong>{t(unavailableCopy(unavailable.reason).title)}</strong>
            <span>{t(unavailableCopy(unavailable.reason).body)}</span>
            {unavailable.detail ? <small>{unavailable.detail}</small> : null}
          </div>
        ) : !remote.frame && !remote.videoLive && !remote.stalled ? (
          <div className="remote-screen-empty">
            <Monitor size={28} />
            <span>{remote.error || t('screen.connecting')}</span>
          </div>
        ) : null}
        {!unavailable &&
        remote.connected &&
        (remote.stalled || (dark && !remote.videoLive)) ? (
          <div
            className="remote-screen-empty remote-screen-asleep"
            onPointerDown={(event) => event.stopPropagation()}
          >
            <MonitorOff size={28} />
            <strong>{t('screen.noPicture')}</strong>
            <span>{remote.error || t('screen.noPictureHint')}</span>
            {wakeWorkspaceId ? (
              <button
                className="chip-button"
                disabled={wakeState === 'pending' || wakeState === 'success'}
                onClick={() => void wakeDisplay()}
              >
                {wakeState === 'pending'
                  ? t('screen.waking')
                  : wakeState === 'success'
                    ? t('screen.wakeSent')
                    : t('screen.wake')}
              </button>
            ) : null}
            {wakeState === 'error' ? (
              <small>{t('screen.wakeFailed')}</small>
            ) : null}
          </div>
        ) : null}
        {remote.control && inputMode === 'trackpad' ? (
          <span
            className="remote-screen-cursor"
            style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
          >
            <MousePointer2 size={20} fill="currentColor" />
          </span>
        ) : null}
        {statsOpen ? (
          <dl className="remote-screen-stats">
            <div>
              <dt>{t('screen.mode')}</dt>
              <dd>{status?.mode ?? 'jpeg'}</dd>
            </div>
            <div>
              <dt>{t('screen.fps')}</dt>
              <dd>{fps}</dd>
            </div>
            <div>
              <dt>{t('screen.latency')}</dt>
              <dd>{frameAge}</dd>
            </div>
            <div>
              <dt>{t('screen.rtc')}</dt>
              <dd>{remote.rtcState}</dd>
            </div>
          </dl>
        ) : null}
      </div>

      <div className="remote-screen-toolbar">
        {remote.control ? (
          <div
            className="remote-screen-mode"
            aria-label={t('screen.inputMode')}
          >
            {(['direct', 'trackpad'] as const).map((mode) => (
              <button
                key={mode}
                className="chip-button"
                aria-pressed={inputMode === mode}
                onClick={() => setInputMode(mode)}
              >
                {t(`screen.${mode}`)}
              </button>
            ))}
          </div>
        ) : (
          <span className="remote-view-only">
            <Monitor size={15} />
            {t('screen.viewOnly')}
          </span>
        )}
        <div className="remote-screen-tools">
          <button
            className="quiet-icon-button"
            aria-label={t('screen.zoomReset')}
            onClick={() => setTransform({ scale: 1, x: 0, y: 0 })}
          >
            <Maximize2 size={18} />
          </button>
          <button
            className="quiet-icon-button"
            aria-label={statsOpen ? t('screen.hideStats') : t('screen.stats')}
            aria-pressed={statsOpen}
            onClick={() => setStatsOpen((open) => !open)}
          >
            <BarChart3 size={18} />
          </button>
          {remote.control ? (
            <button
              className="quiet-icon-button"
              aria-label={t('screen.keyboard')}
              aria-pressed={keyboardOpen}
              onClick={() => setKeyboardOpen((open) => !open)}
            >
              <Keyboard size={18} />
            </button>
          ) : null}
          {remote.control ? (
            <button
              className="quiet-icon-button"
              aria-label={t('screen.paste')}
              onClick={() => void pasteToMac()}
            >
              <ClipboardPaste size={18} />
            </button>
          ) : null}
        </div>
      </div>

      {remote.control && keyboardOpen ? (
        <section className="remote-keyboard" aria-label={t('screen.keyboard')}>
          <form className="remote-text-entry" onSubmit={sendText}>
            <input
              value={text}
              placeholder={t('screen.keyboardPlaceholder')}
              onChange={(event) => setText(event.target.value)}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={(event) => {
                setComposing(false)
                setText(event.currentTarget.value)
              }}
            />
            <button
              className="quiet-icon-button"
              aria-label={t('screen.sendText')}
              disabled={!text.trim() || composing}
            >
              <Send size={18} />
            </button>
          </form>
          <div className="remote-key-row remote-modifier-row">
            {MODIFIERS.map(([name, glyph, label]) => (
              <button
                key={name}
                className="chip-button"
                aria-label={t(`screen.${label}`)}
                aria-pressed={Boolean(modifiers[name])}
                onClick={() =>
                  setModifiers((value) => ({ ...value, [name]: !value[name] }))
                }
              >
                {glyph}
              </button>
            ))}
          </div>
          <div className="remote-key-row">
            {Object.entries(SPECIAL_KEYS).map(([key, label]) => (
              <button
                key={key}
                className="chip-button remote-key"
                aria-label={t(`screen.${label}`)}
                onClick={() => sendKey(key)}
              >
                {key === 'ArrowLeft' ? (
                  <ArrowLeft size={16} />
                ) : key === 'ArrowRight' ? (
                  <ArrowRight size={16} />
                ) : key === 'ArrowUp' ? (
                  <ArrowUp size={16} />
                ) : key === 'ArrowDown' ? (
                  <ArrowDown size={16} />
                ) : (
                  t(`screen.${label}`)
                )}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {notice ? <p className="remote-screen-notice">{notice}</p> : null}
    </section>
  )
}
