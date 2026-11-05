import {
  AppWindowMac,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart3,
  ChevronLeft,
  Hand,
  Keyboard,
  LoaderCircle,
  Monitor,
  MonitorOff,
  MousePointer2,
  Send,
  TriangleAlert,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
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
import { haptic } from '../../haptics'
import { useT } from '../../i18n'
import {
  buildKeyCombo,
  createMoveCoalescer,
  createScrollCoalescer,
  pointerAt,
  type ControlEvent,
  type KeyModifiers,
} from './controls'
import {
  rememberScreenUnavailable,
  screenUnavailableFromStatus,
  UNSUPPORTED_OS,
  unavailableCopy,
} from './availability'
import {
  recallTrackpadHintSeen,
  rememberTrackpadHintSeen,
} from './trackpadHint'
import {
  createTouchGestureState,
  nextGestureDeadline,
  reduceTouchGesture,
  type GestureAction,
  type GestureMode,
  type TouchGestureInput,
} from './touchGestures'
import { BLANK_POSTER, isDarkSample } from './liveness'
import { useRemoteScreen } from './useRemoteScreen'
import {
  clampView,
  desktopToSurface,
  IDENTITY_VIEW,
  isZoomed,
  keepPointVisible,
  oneToOneScale,
  panView,
  pinchView,
  settleView,
  surfaceDeltaToDesktop,
  viewTransform,
  zoomAround,
  zoomPercent,
  type View,
} from './viewport'
import { ScreenPicker } from './ScreenPicker'
import {
  canPickTarget,
  sameSelection,
  sameTarget,
  currentSelection,
  targetForSelection,
  type PickerSelection,
  type ScreenTarget,
} from './screenTargets'
import { selectLocalWakeWorkspace } from './wakeDisplay'
import './remoteScreen.css'

// DOM key name → copy key under `screen.*` (and the key sent to the Mac).
/** How long a notice such as a clipboard copy stays up. */
const NOTICE_MS = 3_000

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
  const [target, setTarget] = useState<ScreenTarget>({})
  useEffect(() => setTarget({}), [pairing.id])
  const remote = useRemoteScreen(tunnel, target)
  const [pickerOpen, setPickerOpen] = useState(false)
  const surfaceRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const cursorRef = useRef<HTMLDivElement>(null)
  const status = remote.status
  const videoSize = useMemo(
    () =>
      status
        ? { width: status.width, height: status.height }
        : remote.frame
          ? { width: remote.frame.width, height: remote.frame.height }
          : { width: 16, height: 10 },
    // Only the dimensions matter; a new status object with the same size
    // must not reset the zoom.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [status?.width, status?.height, remote.frame?.width, remote.frame?.height],
  )
  // Desktop pixels, for the 1:1 zoom.
  const pixelScale = status?.scale || 1
  const pixelSize = useMemo(
    () => ({
      width: videoSize.width * pixelScale,
      height: videoSize.height * pixelScale,
    }),
    [pixelScale, videoSize],
  )
  // The trackpad's hint fades after its first touch and stays gone.
  const [trackpadHintSeen, setTrackpadHintSeen] = useState(
    recallTrackpadHintSeen,
  )
  const [panMode, setPanMode] = useState(false)
  const [zoom, setZoom] = useState({ scale: 1, oneToOne: false })
  const zoomed = zoom.scale > 1
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
  const viewRef = useRef<View>(IDENTITY_VIEW)
  const pinchBase = useRef<View>()
  const cursor = useRef({ x: 0.5, y: 0.5 })
  const gestureState = useRef(createTouchGestureState())
  const gestureTimer = useRef<ReturnType<typeof setTimeout>>()
  const frameTimes = useRef<number[]>([])
  const [fps, setFps] = useState(0)
  const [frameAge, setFrameAge] = useState(0)

  // Control is always the trackpad: the finger moves a cursor drawn here.
  const trackpad = remote.control
  const gestureMode: GestureMode =
    !remote.control || panMode ? 'pan' : 'trackpad'
  const gestureModeRef = useRef(gestureMode)
  gestureModeRef.current = gestureMode

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
  const scrollCoalescer = useMemo(
    () => createScrollCoalescer(remote.sendControl, 33),
    [remote.sendControl],
  )
  useEffect(
    () => () => {
      moveCoalescer.close()
      scrollCoalescer.close()
    },
    [moveCoalescer, scrollCoalescer],
  )

  // The local cursor stands in for the Mac's own while in control.
  useEffect(() => {
    if (remote.connected) remote.send({ type: 'mouse_mode', on: trackpad })
  }, [remote.connected, remote.send, trackpad])

  const surfaceSize = useCallback(() => {
    const rect = surfaceRef.current?.getBoundingClientRect()
    return {
      left: rect?.left ?? 0,
      top: rect?.top ?? 0,
      width: rect?.width ?? 0,
      height: rect?.height ?? 0,
    }
  }, [])

  // Per-frame updates write transforms directly: no React render, no layout.
  const placeCursor = useCallback(() => {
    const element = cursorRef.current
    if (!element) return
    const point = desktopToSurface(
      cursor.current,
      surfaceSize(),
      videoSize,
      viewRef.current,
    )
    element.style.transform = `translate3d(${point.x}px, ${point.y}px, 0)`
  }, [surfaceSize, videoSize])

  const applyView = useCallback(
    (view: View, settled = false) => {
      viewRef.current = view
      if (layerRef.current)
        layerRef.current.style.transform = viewTransform(view)
      placeCursor()
      if (settled) {
        // Measured only when a gesture settles, never per frame.
        const oneToOne = oneToOneScale(
          surfaceSize(),
          pixelSize,
          window.devicePixelRatio || 1,
        )
        setZoom({
          scale: view.scale,
          oneToOne: isZoomed(view) && Math.abs(view.scale - oneToOne) < 0.01,
        })
        if (!isZoomed(view)) setPanMode(false)
      }
    },
    [pixelSize, placeCursor, surfaceSize],
  )

  // A new picture size (another display or window) starts at fit.
  useEffect(() => {
    pinchBase.current = undefined
    applyView(IDENTITY_VIEW, true)
  }, [applyView, videoSize])

  useEffect(() => {
    const surface = surfaceRef.current
    if (!surface || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() =>
      applyView(clampView(viewRef.current, surfaceSize(), videoSize), true),
    )
    observer.observe(surface)
    return () => observer.disconnect()
  }, [applyView, surfaceSize, videoSize])

  useLayoutEffect(() => {
    if (trackpad) placeCursor()
  }, [placeCursor, trackpad])

  const handleGestureActions = useCallback(
    (actions: GestureAction[]) => {
      const size = surfaceSize()
      const view = () => viewRef.current
      const sendPointer = (
        action: 'click' | 'double' | 'right' | 'drag-start' | 'drag-end',
      ) => remote.sendControl(pointerAt(action, cursor.current))
      for (const action of actions) {
        switch (action.type) {
          case 'haptic':
            void haptic(action.kind)
            break
          case 'pinch': {
            pinchBase.current ??= view()
            applyView(
              pinchView(
                pinchBase.current,
                action.startCentroid,
                action.startDistance,
                action.centroid,
                action.distance,
                size,
                videoSize,
              ),
            )
            break
          }
          case 'pinch-end':
            pinchBase.current = undefined
            applyView(settleView(view(), size, videoSize), true)
            break
          case 'reset-zoom':
            pinchBase.current = undefined
            applyView(IDENTITY_VIEW, true)
            break
          case 'pan':
            applyView(panView(view(), action.delta, size, videoSize))
            break
          case 'cursor': {
            const delta = surfaceDeltaToDesktop(
              action.delta,
              size,
              videoSize,
              view(),
            )
            cursor.current = {
              x: Math.min(1, Math.max(0, cursor.current.x + delta.x)),
              y: Math.min(1, Math.max(0, cursor.current.y + delta.y)),
            }
            // Zoomed in, the view follows the cursor near its edges.
            const at = desktopToSurface(cursor.current, size, videoSize, view())
            applyView(keepPointVisible(view(), at, size, videoSize))
            moveCoalescer.push({
              type: 'pointer',
              action: 'move',
              ...cursor.current,
            })
            break
          }
          case 'scroll': {
            scrollCoalescer.push({
              type: 'scroll',
              ...cursor.current,
              dx: action.delta.x / view().scale,
              dy: action.delta.y / view().scale,
            })
            break
          }
          case 'press':
          case 'release':
          case 'click':
          case 'double':
          case 'right': {
            moveCoalescer.flush()
            scrollCoalescer.flush()
            sendPointer(
              action.type === 'press'
                ? 'drag-start'
                : action.type === 'release'
                  ? 'drag-end'
                  : action.type,
            )
            break
          }
        }
      }
    },
    [applyView, moveCoalescer, remote, scrollCoalescer, surfaceSize, videoSize],
  )

  const dispatchGesture = useCallback(
    (input: TouchGestureInput) => {
      const env = {
        mode: gestureModeRef.current,
        zoomed: isZoomed(viewRef.current),
      }
      const result = reduceTouchGesture(gestureState.current, input, env)
      gestureState.current = result.state
      handleGestureActions(result.actions)
      if (gestureTimer.current) clearTimeout(gestureTimer.current)
      gestureTimer.current = undefined
      const deadline = nextGestureDeadline(result.state, env)
      if (deadline !== undefined)
        gestureTimer.current = setTimeout(
          () => dispatchGesture({ type: 'tick', at: performance.now() }),
          Math.max(0, deadline - performance.now()),
        )
    },
    [handleGestureActions],
  )

  // Switching mode starts a fresh gesture so no half-finished one leaks over.
  useEffect(() => {
    if (gestureTimer.current) clearTimeout(gestureTimer.current)
    gestureTimer.current = undefined
    gestureState.current = createTouchGestureState()
  }, [gestureMode])

  useEffect(
    () => () => {
      if (gestureTimer.current) clearTimeout(gestureTimer.current)
    },
    [],
  )

  const pointerInput = (
    type: 'down' | 'move' | 'up' | 'cancel',
    event: ReactPointerEvent,
  ) => {
    if (event.pointerType === 'mouse') return
    event.preventDefault()
    if (type === 'down') {
      event.currentTarget.setPointerCapture(event.pointerId)
      if (trackpad && !trackpadHintSeen) {
        setTrackpadHintSeen(true)
        rememberTrackpadHintSeen()
      }
    }
    const size = surfaceSize()
    dispatchGesture({
      type,
      id: event.pointerId,
      point: { x: event.clientX - size.left, y: event.clientY - size.top },
      at: event.timeStamp,
    })
  }

  const onWheel = (event: React.WheelEvent) => {
    if (!trackpad) return
    event.preventDefault()
    scrollCoalescer.push({
      type: 'scroll',
      ...cursor.current,
      dx: event.deltaX,
      dy: event.deltaY,
    })
  }

  const screenPointerHandlers = {
    onPointerDown: (event: ReactPointerEvent) => pointerInput('down', event),
    onPointerMove: (event: ReactPointerEvent) => pointerInput('move', event),
    onPointerUp: (event: ReactPointerEvent) => pointerInput('up', event),
    onPointerCancel: (event: ReactPointerEvent) =>
      pointerInput('cancel', event),
    onWheel,
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    onClick: (event: React.MouseEvent) => event.preventDefault(),
  }

  const cycleZoom = () => {
    const size = surfaceSize()
    if (zoomed) {
      applyView(IDENTITY_VIEW, true)
      return
    }
    const target = oneToOneScale(size, pixelSize, window.devicePixelRatio || 1)
    applyView(
      zoomAround(
        viewRef.current,
        { x: size.width / 2, y: size.height / 2 },
        target > 1 ? target : 2,
        size,
        videoSize,
      ),
      true,
    )
  }

  // Once per close: later statuses repeat the flag.
  const windowClosed = status?.windowClosed === true
  useEffect(() => {
    if (windowClosed) setNotice(t('screen.picker.windowClosed'))
  }, [windowClosed, t])

  // The desktop ended control (it stopped streaming): say why.
  useEffect(() => {
    if (remote.controlRevoked) setNotice(t('screen.controlEnded'))
  }, [remote.controlRevoked, t])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(''), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [notice])

  const openPicker = () => {
    setPickerOpen(true)
    if (status?.windows) remote.requestWindows()
  }
  const selectTarget = (selection: PickerSelection) => {
    setPickerOpen(false)
    const next = targetForSelection(selection, status)
    // After a window closed the display is already shown, but the target
    // still names the window; reconnect so a later reconnect does not ask
    // for it again.
    if (
      sameSelection(selection, currentSelection(status)) &&
      (sameTarget(next, target) || !target.windowId)
    )
      return
    setTarget(next)
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
        className={`remote-screen-surface${remote.control ? ' is-controlling' : ''}${trackpad ? ' is-trackpad' : ''}${remote.switching ? ' is-switching' : ''}`}
        data-sidebar-swipe-exclude={remote.control || zoomed ? '' : undefined}
        {...screenPointerHandlers}
      >
        <div ref={layerRef} className="remote-screen-transform">
          <ScreenMedia
            stream={remote.stream}
            frame={remote.frame}
            videoLive={remote.videoLive}
            onVideoFrame={remote.markVideoFrame}
            onDark={setDark}
          />
        </div>
        {remote.switching ? (
          <div
            className="remote-screen-switching"
            role="status"
            aria-label={t('screen.switching')}
          >
            <LoaderCircle size={16} className="spinner" aria-hidden="true" />
          </div>
        ) : null}
        {trackpad ? (
          <div
            ref={cursorRef}
            className="remote-screen-cursor"
            aria-hidden="true"
          >
            <MousePointer2 size={20} />
          </div>
        ) : null}
        {trackpad ? (
          <div
            className={`remote-screen-hint${trackpadHintSeen ? ' is-seen' : ''}`}
            aria-hidden="true"
          >
            <Hand size={14} />
            <span>{t('screen.trackpadHint')}</span>
          </div>
        ) : null}
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
        {remote.control ? null : (
          <span className="remote-view-only">
            <Monitor size={15} />
            {t('screen.viewOnly')}
          </span>
        )}
        <div className="remote-screen-tools">
          {canPickTarget(status) ? (
            <button
              className="quiet-icon-button"
              aria-label={t('screen.picker.open')}
              aria-haspopup="dialog"
              onClick={openPicker}
            >
              <AppWindowMac size={18} />
            </button>
          ) : null}
          {remote.control && zoomed ? (
            <button
              className="quiet-icon-button"
              aria-label={t('screen.panView')}
              aria-pressed={panMode}
              onClick={() => setPanMode((value) => !value)}
            >
              <Hand size={18} />
            </button>
          ) : null}
          <button
            className="chip-button remote-zoom-chip"
            aria-label={zoomed ? t('screen.zoomToFit') : t('screen.zoomActual')}
            onClick={cycleZoom}
          >
            {!zoomed
              ? t('screen.zoomFit')
              : zoom.oneToOne
                ? '1:1'
                : `${zoomPercent(zoom.scale)}%`}
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
      {pickerOpen ? (
        <ScreenPicker
          status={status}
          windowList={remote.windowList}
          onSelect={selectTarget}
          onClose={() => setPickerOpen(false)}
        />
      ) : null}
    </section>
  )
}
