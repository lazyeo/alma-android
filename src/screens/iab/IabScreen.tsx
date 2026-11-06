import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Globe,
  Keyboard,
  LoaderCircle,
  Plus,
  RotateCw,
  Send,
  TriangleAlert,
  X,
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
import { createPortal } from 'react-dom'
import { BottomSheet } from '../../components/BottomSheet'
import { useAnimatedOverlay } from '../../components/useAnimatedOverlay'
import { haptic } from '../../haptics'
import { useT } from '../../i18n'
import { shouldFinishOverlayClose } from '../../overlayClosing'
import { ScreenMedia } from '../liveStream/StreamMedia'
import { useStreamZoom } from '../liveStream/useStreamZoom'
import { createScrollCoalescer } from '../remoteScreen/controls'
import {
  createTouchGestureState,
  nextGestureDeadline,
  reduceTouchGesture,
  type GestureAction,
  type TouchGestureInput,
} from '../remoteScreen/touchGestures'
import {
  isZoomed,
  surfaceDeltaToDesktop,
  surfaceToDesktop,
  zoomPercent,
} from '../remoteScreen/viewport'
import '../remoteScreen/remoteScreen.css'
import './iab.css'
import {
  addressText,
  IAB_KEYS,
  pagePoint,
  pageScroll,
  type IabKey,
  type IabTab,
} from './protocol'
import { useIabStream, type IabTunnel } from './useIabStream'

// Key name sent to the desktop → copy key under `screen.*`, shared with the
// Mac screen's keyboard.
const KEY_LABELS = {
  Escape: 'screen.esc',
  Tab: 'screen.tab',
  Enter: 'screen.enter',
  Backspace: 'screen.backspace',
  ArrowLeft: 'screen.left',
  ArrowUp: 'screen.up',
  ArrowDown: 'screen.down',
  ArrowRight: 'screen.right',
} as const satisfies Record<IabKey, string>

const KEY_ICONS: Partial<Record<IabKey, typeof ArrowLeft>> = {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ArrowRight,
}

/** Before the first frame there is no page size; any shape will do. */
const PLACEHOLDER_SIZE = { width: 16, height: 10 }

/**
 * The in-app browser of Alma on the computer, live, for one thread: the
 * picture is the Mac's page, and taps, scrolls, typing and navigation run
 * there. Opened over the conversation; Back closes it.
 */
export function IabScreen({
  tunnel,
  threadId,
  onClose,
  onUnsupported,
}: {
  tunnel: IabTunnel
  threadId: string
  onClose: () => void
  /** The desktop turned out to have no browser view. */
  onUnsupported?: () => void
}) {
  const t = useT()
  const { closing, requestClose, finishClose } = useAnimatedOverlay(
    true,
    onClose,
  )
  const iab = useIabStream(tunnel, threadId)
  const { send } = iab
  const surfaceRef = useRef<HTMLDivElement>(null)
  const layerRef = useRef<HTMLDivElement>(null)
  const viewport = iab.viewport ?? PLACEHOLDER_SIZE
  const content = useMemo(
    () => ({ width: viewport.width, height: viewport.height }),
    [viewport.width, viewport.height],
  )
  const { viewRef, zoom, zoomed, surfaceSize, zoomGesture, cycleZoom } =
    useStreamZoom({ surfaceRef, layerRef, content, pixels: content })
  const gestureState = useRef(createTouchGestureState())
  const gestureTimer = useRef<ReturnType<typeof setTimeout>>()
  const [address, setAddress] = useState('')
  const [editingAddress, setEditingAddress] = useState(false)
  const [tabsOpen, setTabsOpen] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const [text, setText] = useState('')
  const [composing, setComposing] = useState(false)

  useEffect(() => {
    if (iab.unsupported) onUnsupported?.()
  }, [iab.unsupported, onUnsupported])

  // The address follows the page unless the user is typing a new one.
  useEffect(() => {
    if (!editingAddress) setAddress(addressText(iab.page.url))
  }, [editingAddress, iab.page.url])

  const scrollCoalescer = useMemo(() => createScrollCoalescer(send, 33), [send])
  useEffect(() => () => scrollCoalescer.close(), [scrollCoalescer])

  const live = iab.bound === true && Boolean(iab.frame || iab.videoLive)

  const handleGestureActions = useCallback(
    (actions: GestureAction[]) => {
      const size = surfaceSize()
      const toPage = (point: { x: number; y: number }) => {
        const at = surfaceToDesktop(point, size, content, viewRef.current)
        return at.inside ? pagePoint(at, content) : undefined
      }
      for (const action of actions) {
        if (zoomGesture(action)) continue
        if (!live) continue
        switch (action.type) {
          case 'click':
          case 'double': {
            const at = toPage(action.point)
            if (!at) break
            scrollCoalescer.flush()
            void haptic('light')
            send({
              type: action.type === 'click' ? 'tap' : 'double_tap',
              ...at,
            })
            break
          }
          case 'scroll': {
            const at = toPage(action.point)
            if (!at) break
            const delta = surfaceDeltaToDesktop(
              action.delta,
              size,
              content,
              viewRef.current,
            )
            scrollCoalescer.push({
              type: 'scroll',
              ...at,
              ...pageScroll(delta, content),
            })
            break
          }
          default:
            break
        }
      }
    },
    [content, live, scrollCoalescer, send, surfaceSize, viewRef, zoomGesture],
  )

  const dispatchGesture = useCallback(
    (input: TouchGestureInput) => {
      const env = { mode: 'touch' as const, zoomed: isZoomed(viewRef.current) }
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
    [handleGestureActions, viewRef],
  )
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
    if (type === 'down') event.currentTarget.setPointerCapture(event.pointerId)
    const size = surfaceSize()
    dispatchGesture({
      type,
      id: event.pointerId,
      point: { x: event.clientX - size.left, y: event.clientY - size.top },
      at: event.timeStamp,
    })
  }

  // A mouse (desktop web, emulators) clicks and wheels directly.
  const mousePage = (event: React.MouseEvent) => {
    const size = surfaceSize()
    const at = surfaceToDesktop(
      { x: event.clientX - size.left, y: event.clientY - size.top },
      size,
      content,
      viewRef.current,
    )
    return at.inside ? pagePoint(at, content) : undefined
  }
  const surfaceHandlers = {
    onPointerDown: (event: ReactPointerEvent) => pointerInput('down', event),
    onPointerMove: (event: ReactPointerEvent) => pointerInput('move', event),
    onPointerUp: (event: ReactPointerEvent) => pointerInput('up', event),
    onPointerCancel: (event: ReactPointerEvent) =>
      pointerInput('cancel', event),
    onClick: (event: React.MouseEvent) => {
      event.preventDefault()
      if ((event.nativeEvent as PointerEvent).pointerType !== 'mouse') return
      const at = live ? mousePage(event) : undefined
      if (at) iab.send({ type: 'tap', ...at })
    },
    onWheel: (event: React.WheelEvent) => {
      const at = live ? mousePage(event) : undefined
      if (!at) return
      scrollCoalescer.push({
        type: 'scroll',
        ...at,
        dx: event.deltaX,
        dy: event.deltaY,
      })
    },
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
  }

  const navigate = (event: FormEvent) => {
    event.preventDefault()
    const url = address.trim()
    if (!url) return
    void haptic('light')
    iab.send({ type: 'navigate', url })
    setEditingAddress(false)
    ;(document.activeElement as HTMLElement | null)?.blur?.()
  }

  const sendText = (event?: FormEvent) => {
    event?.preventDefault()
    if (composing || !text) return
    iab.send({ type: 'text', text })
    setText('')
  }

  const loading = iab.page.loading
  const empty = iab.unsupported ? (
    <div className="remote-screen-empty remote-screen-asleep" role="alert">
      <TriangleAlert size={28} />
      <strong>{t('browser.unsupportedTitle')}</strong>
      <span>{t('browser.unsupportedBody')}</span>
    </div>
  ) : iab.bound === false ? (
    <div className="remote-screen-empty remote-screen-asleep">
      <Globe size={28} />
      <strong>{t('browser.closedTitle')}</strong>
      <span>{t('browser.closedBody')}</span>
      {iab.error ? <small>{iab.error}</small> : null}
    </div>
  ) : !live ? (
    <div className="remote-screen-empty">
      <LoaderCircle size={24} className="spinner" aria-hidden="true" />
      <span>{iab.bound ? t('browser.loading') : t('browser.connecting')}</span>
    </div>
  ) : null

  return createPortal(
    <section
      className={`remote-screen-page iab-page${closing ? ' closing' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={t('browser.title')}
      onAnimationEnd={(event) => {
        if (
          shouldFinishOverlayClose(closing, event.target, event.currentTarget)
        )
          finishClose()
      }}
    >
      <header className="remote-screen-header iab-header">
        <button
          className="scoped-root-back"
          aria-label={t('browser.close')}
          onClick={() => {
            void haptic('light')
            requestClose()
          }}
        >
          <X size={20} />
        </button>
        <form className="iab-address" role="search" onSubmit={navigate}>
          {loading ? (
            <LoaderCircle
              size={15}
              className="spinner iab-address-icon"
              aria-hidden="true"
            />
          ) : (
            <Globe size={15} className="iab-address-icon" aria-hidden="true" />
          )}
          <input
            value={address}
            aria-label={t('browser.address')}
            placeholder={t('browser.addressPlaceholder')}
            inputMode="url"
            enterKeyHint="go"
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
            disabled={iab.unsupported}
            onFocus={(event) => {
              setEditingAddress(true)
              event.currentTarget.select()
            }}
            onBlur={() => setEditingAddress(false)}
            onChange={(event) => setAddress(event.target.value)}
          />
        </form>
        <button
          className="chip-button iab-tabs-chip"
          aria-label={t('browser.tabs', { count: iab.tabs.length })}
          aria-haspopup="dialog"
          disabled={iab.unsupported || !iab.connected}
          onClick={() => setTabsOpen(true)}
        >
          {iab.tabs.length}
        </button>
      </header>

      <div
        ref={surfaceRef}
        className="remote-screen-surface iab-surface"
        data-sidebar-swipe-exclude=""
        {...surfaceHandlers}
      >
        <div ref={layerRef} className="remote-screen-transform">
          <ScreenMedia
            stream={iab.bound ? iab.stream : undefined}
            frame={iab.bound ? iab.frame : undefined}
            videoLive={iab.videoLive}
            onVideoFrame={iab.markVideoFrame}
            onDark={ignoreDark}
          />
        </div>
        {empty}
      </div>

      <div className="remote-screen-toolbar iab-toolbar">
        <div className="remote-key-row">
          <button
            className="quiet-icon-button"
            aria-label={t('browser.back')}
            disabled={!live}
            onClick={() => iab.send({ type: 'back' })}
          >
            <ChevronLeft size={20} />
          </button>
          <button
            className="quiet-icon-button"
            aria-label={t('browser.forward')}
            disabled={!live}
            onClick={() => iab.send({ type: 'forward' })}
          >
            <ChevronRight size={20} />
          </button>
          <button
            className="quiet-icon-button"
            aria-label={t('browser.reload')}
            disabled={!live}
            onClick={() => iab.send({ type: 'reload' })}
          >
            <RotateCw size={17} />
          </button>
        </div>
        <div className="remote-screen-tools">
          <button
            className="chip-button remote-zoom-chip"
            aria-label={zoomed ? t('screen.zoomToFit') : t('screen.zoomActual')}
            disabled={!live}
            onClick={cycleZoom}
          >
            {zoomed ? `${zoomPercent(zoom.scale)}%` : t('screen.zoomFit')}
          </button>
          <button
            className="quiet-icon-button"
            aria-label={t('browser.keyboard')}
            aria-pressed={keyboardOpen}
            disabled={!live}
            onClick={() => setKeyboardOpen((open) => !open)}
          >
            <Keyboard size={18} />
          </button>
        </div>
      </div>

      {keyboardOpen && live ? (
        <section className="remote-keyboard" aria-label={t('browser.keyboard')}>
          <form className="remote-text-entry" onSubmit={sendText}>
            <input
              value={text}
              placeholder={t('browser.keyboardPlaceholder')}
              autoCapitalize="off"
              autoCorrect="off"
              onChange={(event) => setText(event.target.value)}
              onCompositionStart={() => setComposing(true)}
              onCompositionEnd={(event) => {
                setComposing(false)
                setText(event.currentTarget.value)
              }}
            />
            <button
              className="quiet-icon-button"
              aria-label={t('browser.sendText')}
              disabled={!text || composing}
            >
              <Send size={18} />
            </button>
          </form>
          <div className="remote-key-row">
            {IAB_KEYS.map((key) => {
              const Icon = KEY_ICONS[key]
              const label = t(KEY_LABELS[key])
              return (
                <button
                  key={key}
                  className="chip-button remote-key"
                  aria-label={label}
                  onClick={() => iab.send({ type: 'key', key })}
                >
                  {Icon ? <Icon size={16} /> : label}
                </button>
              )
            })}
          </div>
        </section>
      ) : null}

      {tabsOpen ? (
        <IabTabsSheet
          tabs={iab.tabs}
          activeId={iab.activeTabId}
          onView={(id) => {
            setTabsOpen(false)
            iab.send({ type: 'tab', action: 'view', id })
          }}
          onCloseTab={(id) => iab.send({ type: 'tab', action: 'close', id })}
          onNew={() => {
            setTabsOpen(false)
            iab.send({ type: 'tab', action: 'new' })
          }}
          onClose={() => setTabsOpen(false)}
        />
      ) : null}
    </section>,
    document.body,
  )
}

// A blank page is legitimately dark; the Mac screen's no-picture check does
// not apply to a browser page.
const ignoreDark = () => undefined

function IabTabsSheet({
  tabs,
  activeId,
  onView,
  onCloseTab,
  onNew,
  onClose,
}: {
  tabs: IabTab[]
  activeId: string
  onView: (id: string) => void
  onCloseTab: (id: string) => void
  onNew: () => void
  onClose: () => void
}) {
  const t = useT()
  return (
    <BottomSheet
      title={t('browser.tabsTitle')}
      className="iab-tabs-sheet"
      onClose={onClose}
    >
      <div className="sheet-list">
        {tabs.map((tab) => {
          const selected = tab.id === activeId
          const title =
            tab.title || addressText(tab.url) || t('browser.untitledTab')
          return (
            <div key={tab.id} className="iab-tab-row">
              <button
                className={`sheet-row${selected ? ' selected' : ''}`}
                aria-pressed={selected}
                onClick={() => onView(tab.id)}
              >
                <span className="remote-picker-icon" aria-hidden="true">
                  {tab.agent ? <Bot size={16} /> : <Globe size={16} />}
                </span>
                <span className="sheet-row-copy">
                  <span>{title}</span>
                  <small>
                    {tab.agent
                      ? t('browser.agentTab')
                      : addressText(tab.url) || ' '}
                  </small>
                </span>
                {selected ? (
                  <Check className="sheet-row-check" size={18} />
                ) : null}
              </button>
              {tab.pinned ? null : (
                <button
                  className="quiet-icon-button"
                  aria-label={t('browser.closeTab', { title })}
                  onClick={() => onCloseTab(tab.id)}
                >
                  <X size={16} />
                </button>
              )}
            </div>
          )
        })}
        <button className="sheet-row" onClick={onNew}>
          <span className="remote-picker-icon" aria-hidden="true">
            <Plus size={16} />
          </span>
          <span className="sheet-row-copy">
            <span>{t('browser.newTab')}</span>
          </span>
        </button>
      </div>
    </BottomSheet>
  )
}
