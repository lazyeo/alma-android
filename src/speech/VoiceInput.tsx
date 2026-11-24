import { Keyboard, Mic } from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { createLongPress } from '../components/longPress'
import { focusToType } from './typingFocus'
import { useOverlayRegistration } from '../components/useOverlayRegistration'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import {
  decideDelivery,
  MIN_HOLD_MS,
  releaseOutcome,
  type DictationAction,
} from './delivery'
import { MAX_RECORDING_MS } from './dictationSession'
import { DictationSheet } from './DictationSheet'
import {
  engineChain,
  loadSpeechSettings,
  type DictationSurface,
} from './engineStore'
import { HoldOverlay, WAVE_BARS, type EntryFrame } from './HoldOverlay'
import {
  holdLayout,
  zoneAt,
  type HoldLayout,
  type HoldZone,
} from './holdLayout'
import { loadInputMode, saveInputMode, type InputMode } from './inputMode'
import { canLongPressToTalk } from './longPressTalk'
import { speechAvailable } from './nativeSpeech'
import { useAfterNextRender } from './useAfterNextRender'
import { useDictation } from './useDictation'

/** How long a held-back send's explanation stays up. */
export const NOTICE_MS = 3500
/**
 * Native stops at MAX_RECORDING_MS on its own; this is the backstop should
 * its `limit` event never arrive, so a locked recording cannot run on.
 */
export const LIMIT_GRACE_MS = 3000
/** How often the locked recording's clock redraws. */
const LOCKED_TICK_MS = 250

export interface VoiceInputOptions {
  /** Picks the "after release" setting (Settings → Voice input). */
  surface: DictationSurface
  /** The composer's current text, for the held-back-send rules. */
  draft(): string
  /** Puts text into the composer at the caret or after its text. */
  onInsert(text: string, at: 'caret' | 'end'): void
  /** Sends through the composer's own send path; absent → insert only. */
  onSend?(text: string): void
  /** Focused when the composer switches back to the keyboard. */
  textareaRef?: RefObject<HTMLTextAreaElement>
}

/** Pointer handlers for an element that starts or follows a hold. */
export interface HoldPointerProps {
  onPointerDown(event: PointerEvent<HTMLElement>): void
  onPointerMove(event: PointerEvent<HTMLElement>): void
  onPointerUp(event: PointerEvent<HTMLElement>): void
  onPointerCancel(event: PointerEvent<HTMLElement>): void
  onContextMenu(event: React.MouseEvent<HTMLElement>): void
}

export interface VoiceInput {
  /**
   * The small mic/keyboard switch left of the input. Also carries the hold
   * overlay and the setup sheet, which both entries share.
   */
  toggle: ReactNode
  /** The hold-to-talk bar replacing the text box, or null on the keyboard. */
  bar: ReactNode | null
  /**
   * Spread on the text box: while it is empty, a tap types and a long press
   * starts the same hold as the bar (see canLongPressToTalk).
   */
  textHold: HoldPointerProps & { 'data-hold-to-talk': true }
  /** The empty text box's placeholder, saying what a tap and a hold do. */
  hint: string
}

/**
 * A composer's voice input. The text box is the entry: a tap types, a long
 * press on an empty box holds to talk. The switch keeps the
 * full-width hold-to-talk bar for those who prefer it. Undefined in the
 * web build, which has no native recorder.
 */
export function useVoiceInput(
  options: VoiceInputOptions,
): VoiceInput | undefined {
  const t = useT()
  const [mode, setMode] = useState<InputMode>(() =>
    loadInputMode(options.surface),
  )
  // Lives here, not in the bar: an insert switches to the keyboard and
  // unmounts the bar, and the notice explains that very insert.
  const [notice, setNotice] = useState('')
  const afterRender = useAfterNextRender()
  const latest = useRef(options)
  latest.current = options
  useEffect(() => {
    if (!notice) return
    // A notice posted while Alma is off screen (a recording stopped as it
    // left) only starts its countdown once the user is back to read it.
    let timer: number | undefined
    const countDown = () => {
      if (document.visibilityState === 'hidden' || timer !== undefined) return
      timer = window.setTimeout(() => setNotice(''), NOTICE_MS)
    }
    countDown()
    document.addEventListener('visibilitychange', countDown)
    return () => {
      document.removeEventListener('visibilitychange', countDown)
      window.clearTimeout(timer)
    }
  }, [notice])
  const changeMode = (next: InputMode) => {
    setMode(next)
    saveInputMode(options.surface, next)
  }
  // One hold for both entries: switching modes never drops a recording.
  const talk = useHoldToTalk({
    surface: options.surface,
    draft: () => latest.current.draft(),
    canSend: Boolean(options.onSend),
    onNotice: setNotice,
    onSend: (text) => latest.current.onSend?.(text),
    // Inserted text is there to be edited: show the text box first.
    onInsert: (text, at) => {
      changeMode('keyboard')
      afterRender(() => latest.current.onInsert(text, at))
    },
  })
  const textHold = useTextHold(talk, () => latest.current.textareaRef?.current)
  if (!speechAvailable()) return undefined

  const keyboard = () => {
    changeMode('keyboard')
    afterRender(() => latest.current.textareaRef?.current?.focus())
  }
  const voice = mode === 'voice'
  return {
    textHold,
    hint: t('speech.hold.boxHint'),
    toggle: (
      <>
        <button
          type="button"
          className="quiet-icon-button voice-mode-toggle"
          aria-label={
            voice ? t('speech.toggle.keyboard') : t('speech.toggle.voice')
          }
          onClick={() => {
            void haptic('selection')
            if (voice) keyboard()
            else changeMode('voice')
          }}
        >
          {voice ? (
            <Keyboard size={18} strokeWidth={2} />
          ) : (
            <Mic size={18} strokeWidth={2} />
          )}
        </button>
        {notice ? (
          <p className="dictation-notice" role="status">
            {notice}
          </p>
        ) : null}
        {talk.view}
      </>
    ),
    bar: voice ? (
      <button
        type="button"
        className="voice-hold-bar"
        data-active={talk.holding}
        {...talk.barProps}
      >
        {t('speech.hold.bar')}
      </button>
    ) : null,
  }
}

/**
 * The text box's press while it is empty. Android's WebView would run its
 * own long press on an editable box (callout, insertion handle) and cancel
 * the pointer for it, killing the hold a moment after it started, so the
 * touch is cancelled and the whole press is ours: let go before the hold
 * delay and the box takes focus (the keyboard); hold past it and the hold
 * takes the pointer, with slides and release following the bar's gesture.
 * With text in the box, the press is the system's, as usual.
 */
function useTextHold(
  talk: HoldToTalk,
  area: () => HTMLTextAreaElement | null | undefined,
): VoiceInput['textHold'] {
  const latest = useRef({ talk, area })
  latest.current = { talk, area }
  const pending = useRef<{ pointerId: number; element: HTMLElement }>()
  const press = useMemo(
    () =>
      createLongPress(() => {
        const held = pending.current
        pending.current = undefined
        if (!held || latest.current.talk.busy) return
        // Should the system have focused the box on the way down, put the
        // keyboard away: the overlay is taking the screen.
        const box = latest.current.area()
        if (box && document.activeElement === box) box.blur()
        held.element.setPointerCapture?.(held.pointerId)
        // The whole input area takes on the hold's look, not just the box.
        latest.current.talk.begin(
          held.pointerId,
          held.element.closest<HTMLElement>('.composer-input') ?? held.element,
        )
      }),
    [],
  )
  useEffect(() => press.cancel, [press])
  const eligible = () => canLongPressToTalk(latest.current.area())
  // React listens to touchstart passively, so cancelling it needs a native
  // listener. On the document, so it holds however late the box mounts.
  useEffect(() => {
    const claim = (event: TouchEvent) => {
      const box = latest.current.area()
      if (box && event.target === box && canLongPressToTalk(box))
        event.preventDefault()
    }
    document.addEventListener('touchstart', claim, {
      capture: true,
      passive: false,
    })
    return () =>
      document.removeEventListener('touchstart', claim, { capture: true })
  }, [])
  const drop = () => {
    press.cancel()
    pending.current = undefined
  }
  return {
    'data-hold-to-talk': true,
    onPointerDown(event) {
      if (event.button > 0 || !event.isPrimary || talk.busy || !eligible())
        return
      pending.current = {
        pointerId: event.pointerId,
        element: event.currentTarget,
      }
      press.start(event.clientX, event.clientY)
    },
    onPointerMove(event) {
      if (event.pointerId === pending.current?.pointerId)
        press.move(event.clientX, event.clientY)
      talk.follow.onPointerMove(event)
    },
    onPointerUp(event) {
      // Released before the hold: a tap, which the cancelled touch no
      // longer turns into focus by itself.
      const tapped = event.pointerId === pending.current?.pointerId
      drop()
      const box = latest.current.area()
      if (tapped && box) focusToType(box)
      talk.follow.onPointerUp(event)
    },
    onPointerCancel(event) {
      drop()
      talk.follow.onPointerCancel(event)
    },
    // The system's long-press menu only where the rule leaves it the press.
    onContextMenu(event) {
      if (pending.current || talk.busy || eligible()) event.preventDefault()
    },
  }
}

/** Where the pressed input area sits on screen, and its corners. */
function entryFrame(area: HTMLElement): EntryFrame {
  const box = area.getBoundingClientRect()
  return {
    left: box.left,
    top: box.top,
    width: box.width,
    height: box.height,
    radius: getComputedStyle(area).borderRadius,
  }
}

/** The safe-area inset at the bottom, which CSS knows and JS does not. */
function safeBottom(): number {
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;visibility:hidden;height:var(--safe-bottom)'
  document.body.appendChild(probe)
  const inset = probe.getBoundingClientRect().height
  probe.remove()
  return inset
}

interface Hold {
  pointerId: number
  pressedAt: number
  zone: HoldZone
}

/** A hold released in the lock area: recording goes on without a finger. */
interface Locked {
  pressedAt: number
}

/**
 * Why a recording stopped without the user choosing what to do with it.
 * The result then goes into the composer, never sent, with this notice.
 */
type SafeStop = 'limit' | 'background' | 'back' | 'interrupted'

/** A hold to talk, startable from the bar or from the text box. */
export interface HoldToTalk {
  /** A finger is down on a hold (not locked, not finishing). */
  holding: boolean
  /** Holding, locked, or waiting on the transcript: no new hold starts. */
  busy: boolean
  /**
   * Starts a hold for this pointer now (setup sheet when none can run).
   * `area` is the input area pressed, drawn as the hold while it lasts.
   */
  begin(pointerId: number, area: HTMLElement): void
  /** Follows a started hold's pointer: slides, release, system cancel. */
  follow: Pick<
    HoldPointerProps,
    'onPointerMove' | 'onPointerUp' | 'onPointerCancel'
  >
  /** The bar: a hold starts on press. */
  barProps: HoldPointerProps
  /** The overlay and setup sheet, rendered once for both entries. */
  view: ReactNode
}

export function useHoldToTalk({
  surface,
  draft,
  canSend,
  onSend,
  onInsert,
  onNotice,
}: {
  surface: DictationSurface
  draft(): string
  canSend: boolean
  /** Shows (or with '' clears) a short explanation by the composer. */
  onNotice(text: string): void
  onSend(text: string): void
  onInsert(text: string, at: 'caret' | 'end'): void
}): HoldToTalk {
  const t = useT()
  const { state, engine, start, stop, cancel, reset } = useDictation()
  const [hold, setHold] = useState<Hold>()
  const [locked, setLocked] = useState<Locked>()
  /** Redraws the locked clock. */
  const [now, setNow] = useState(() => Date.now())
  /** Set from release until the transcript lands, with the release zone. */
  const [finishing, setFinishing] = useState<HoldZone>()
  const [layout, setLayout] = useState<HoldLayout>()
  // The pressed input area, drawn as the hold. Measured again on resize:
  // a hold that starts with the keyboard up puts it away, moving the area.
  const pressedArea = useRef<HTMLElement>()
  const [entry, setEntry] = useState<EntryFrame>()
  const [release, setRelease] = useState<DictationAction>('send')
  const [setupNeeded, setSetupNeeded] = useState(false)
  const [levels, setLevels] = useState<number[]>([])
  /** What to do with the result, chosen on release. */
  const pendingAction = useRef<DictationAction>()
  // Released while still starting: stop as soon as recording begins.
  const stopWhenRecording = useRef(false)
  const safeStopReason = useRef<SafeStop>()
  const latest = useRef({ draft, onSend, onInsert, onNotice })
  latest.current = { draft, onSend, onInsert, onNotice }

  const deliver = (action: DictationAction, text: string) => {
    const delivery = decideDelivery(
      canSend ? action : 'insert',
      text,
      latest.current.draft(),
    )
    if (delivery.kind === 'send') return latest.current.onSend(delivery.text)
    latest.current.onInsert(delivery.text, delivery.at)
    if (delivery.heldBack)
      latest.current.onNotice(t(`speech.notice.${delivery.heldBack}`))
  }

  const dismiss = () => {
    setHold(undefined)
    setLocked(undefined)
    setFinishing(undefined)
    stopWhenRecording.current = false
    pendingAction.current = undefined
    safeStopReason.current = undefined
  }

  /** Stops into the transcript `outcome` asks for (or waits to). */
  const finishAs = (zone: HoldZone, outcome: DictationAction) => {
    setHold(undefined)
    setLocked(undefined)
    setFinishing(zone)
    pendingAction.current = outcome
    if (state.phase === 'recording') stop()
    // Native's cap already stopped it: the transcript is on its way.
    else if (state.phase !== 'finishing') stopWhenRecording.current = true
  }

  /**
   * What letting go in `zone` does, from the finger or from a locked
   * recording's buttons (which name the zone their action matches).
   */
  const conclude = (
    zone: HoldZone,
    pressedAt: number,
    action: DictationAction,
  ) => {
    const outcome = releaseOutcome(zone, Date.now() - pressedAt, action)
    void haptic('light')
    if (outcome === 'cancel' || outcome === 'too_short') {
      dismiss()
      cancel()
      if (outcome === 'too_short')
        latest.current.onNotice(t('speech.notice.tooShort'))
      return
    }
    if (outcome === 'lock') {
      setHold(undefined)
      setNow(Date.now())
      setLocked({ pressedAt })
      return
    }
    finishAs(zone, outcome)
  }

  /**
   * The app left the screen, the system took the finger, Back was pressed,
   * or the cap was reached: keep what was recorded by putting it into the
   * composer, and say why. Nothing recorded yet (still starting) means
   * nothing to keep.
   */
  const stopSafely = (why: SafeStop) => {
    if (!hold && !locked) return
    if (state.phase !== 'recording') {
      dismiss()
      cancel()
      return
    }
    safeStopReason.current = why
    finishAs(hold?.zone === 'edit' ? 'edit' : 'release', 'insert')
  }
  const latestStopSafely = useRef(stopSafely)
  latestStopSafely.current = stopSafely

  const press = (pointerId: number, area: HTMLElement) => {
    const settings = loadSpeechSettings()
    if (!engineChain(settings).length) {
      setSetupNeeded(true)
      return
    }
    latest.current.onNotice('')
    setLevels([])
    setRelease(canSend ? settings.release[surface] : 'insert')
    setLayout(holdLayout(window.innerWidth, window.innerHeight, safeBottom()))
    pressedArea.current = area
    setEntry(entryFrame(area))
    setHold({ pointerId, pressedAt: Date.now(), zone: 'release' })
    stopWhenRecording.current = false
    pendingAction.current = undefined
    void haptic('medium')
    start()
  }

  const move = (x: number, y: number) => {
    if (!hold || !layout) return
    const zone = zoneAt(layout, x, y)
    if (zone === hold.zone) return
    setHold({ ...hold, zone })
    void haptic('selection')
  }

  const letGo = () => {
    if (hold) conclude(hold.zone, hold.pressedAt, release)
  }

  const recording = Boolean(hold || locked)
  // A backgrounded WebView may lose the mic (Android silences background
  // capture) and a phone call takes the screen: stop while the audio so far
  // is intact rather than record silence or lose it.
  useEffect(() => {
    if (!recording) return
    const stopWhenHidden = () => {
      if (document.visibilityState === 'hidden')
        latestStopSafely.current('background')
    }
    document.addEventListener('visibilitychange', stopWhenHidden)
    return () =>
      document.removeEventListener('visibilitychange', stopWhenHidden)
  }, [recording])

  // Back would otherwise leave the screen and drop the recording, or the
  // transcript still on its way (a long locked one may take a minute to
  // upload): locked it stops safely, finishing it does nothing, as the
  // overlay's Cancel is the way out.
  useOverlayRegistration(Boolean(locked || finishing), () =>
    latestStopSafely.current('back'),
  )

  useEffect(() => {
    if (!locked) return
    const timer = window.setInterval(() => setNow(Date.now()), LOCKED_TICK_MS)
    return () => window.clearInterval(timer)
  }, [locked])

  const elapsedMs =
    locked && state.phase === 'recording' ? now - state.startedAt : 0
  useEffect(() => {
    if (elapsedMs >= MAX_RECORDING_MS + LIMIT_GRACE_MS)
      latestStopSafely.current('limit')
  }, [elapsedMs])

  useEffect(() => {
    if (state.phase === 'recording') {
      setLevels((current) => [...current, state.level].slice(-WAVE_BARS))
      if (stopWhenRecording.current) {
        stopWhenRecording.current = false
        stop()
      }
    } else if (state.phase === 'finishing') {
      // Only native (its length cap, a failed mic) stops a recording
      // nobody let go of.
      if (!pendingAction.current && (hold || locked)) {
        safeStopReason.current =
          state.cutOff === 'mic' ? 'interrupted' : 'limit'
        finishAs(hold?.zone === 'edit' ? 'edit' : 'release', 'insert')
      }
    } else if (state.phase === 'done') {
      // A recording that hit the length cap was never released: putting
      // it in the composer is the safe choice.
      const why =
        safeStopReason.current ?? (pendingAction.current ? undefined : 'limit')
      // A safe stop always inserts at the caret, which holds nothing back,
      // so its notice replaces none.
      deliver(pendingAction.current ?? 'insert', state.text)
      if (why)
        latest.current.onNotice(
          why === 'limit'
            ? t('speech.notice.limit', { minutes: MAX_RECORDING_MS / 60_000 })
            : t(`speech.notice.${why}`),
        )
      void haptic('selection')
      dismiss()
      reset()
    } else if (state.phase === 'error' || state.phase === 'idle') {
      dismiss()
    }
    // deliver reads the latest props through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, reset, stop])

  const transcript =
    state.phase === 'recording' || state.phase === 'finishing'
      ? `${state.transcript.final}${state.transcript.tail}`
      : ''
  const active = ('engine' in state && state.engine) || engine
  const label = (item: typeof engine) =>
    item.custom ? t('speech.engine.custom') : item.label
  const fallback =
    'fallback' in state && state.fallback
      ? t(`speech.sheet.fallback.${state.fallback.reason}`, {
          from: label(state.fallback.from),
          to: label(state.fallback.to),
        })
      : undefined
  const zone = hold?.zone ?? (locked ? 'lock' : finishing)
  const showing = Boolean(zone)
  useEffect(() => {
    if (!showing) return
    const remeasure = () => {
      const area = pressedArea.current
      if (area) setEntry(entryFrame(area))
    }
    const viewport = window.visualViewport
    window.addEventListener('resize', remeasure)
    viewport?.addEventListener('resize', remeasure)
    return () => {
      window.removeEventListener('resize', remeasure)
      viewport?.removeEventListener('resize', remeasure)
    }
  }, [showing])
  const busy = Boolean(hold || locked || finishing)

  const follow: HoldToTalk['follow'] = {
    onPointerMove(event) {
      if (event.pointerId === hold?.pointerId)
        move(event.clientX, event.clientY)
    },
    onPointerUp(event) {
      if (event.pointerId === hold?.pointerId) letGo()
    },
    // The system took the pointer (the mic permission dialog, a call
    // taking the screen, a system gesture): no real release happened.
    // Before there is speech worth keeping, drop the dictation; after,
    // keep it, as Android may cancel the finger before the page hides.
    onPointerCancel(event) {
      if (event.pointerId !== hold?.pointerId) return
      if (
        state.phase === 'recording' &&
        Date.now() - hold.pressedAt >= MIN_HOLD_MS
      )
        return stopSafely('interrupted')
      dismiss()
      cancel()
    },
  }

  const view = (
    <>
      {zone && layout ? (
        <HoldOverlay
          layout={layout}
          zone={zone}
          finishing={Boolean(finishing)}
          release={release}
          transcript={transcript}
          levels={levels}
          entry={entry}
          engineLabel={label(active)}
          fallback={fallback}
          onCancel={() => {
            dismiss()
            cancel()
          }}
          locked={
            locked && !finishing
              ? {
                  elapsedMs,
                  canSend,
                  onSend: () => conclude('release', locked.pressedAt, 'send'),
                  onEdit: () => conclude('edit', locked.pressedAt, release),
                }
              : undefined
          }
        />
      ) : null}
      {setupNeeded || state.phase === 'error' ? (
        <DictationSheet
          state={state}
          engine={engine}
          setupNeeded={setupNeeded}
          onClose={() => {
            setSetupNeeded(false)
            reset()
          }}
          onInsert={(text) => {
            setSetupNeeded(false)
            reset()
            latest.current.onInsert(text, 'caret')
          }}
        />
      ) : null}
    </>
  )

  return {
    holding: Boolean(hold),
    busy,
    begin: (pointerId, area) => {
      if (!busy) press(pointerId, area)
    },
    follow,
    barProps: {
      ...follow,
      onPointerDown(event) {
        if (event.button > 0 || busy) return
        event.preventDefault()
        event.currentTarget.setPointerCapture?.(event.pointerId)
        press(event.pointerId, event.currentTarget)
      },
      onContextMenu: (event) => event.preventDefault(),
    },
    view,
  }
}
