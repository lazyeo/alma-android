import { AudioLines, Keyboard } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
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
import { HoldOverlay, WAVE_BARS } from './HoldOverlay'
import {
  holdLayout,
  zoneAt,
  type HoldLayout,
  type HoldZone,
} from './holdLayout'
import { loadInputMode, saveInputMode, type InputMode } from './inputMode'
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

export interface VoiceInput {
  /** The voice/keyboard switch, left of the input. */
  toggle: ReactNode
  /** The hold-to-talk bar replacing the text box, or null on the keyboard. */
  bar: ReactNode | null
}

/**
 * A composer's voice mode: a switch, and in voice mode a full-width
 * hold-to-talk bar in place of the text box. Undefined in the web build,
 * which has no native recorder.
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
  if (!speechAvailable()) return undefined

  const changeMode = (next: InputMode) => {
    setMode(next)
    saveInputMode(options.surface, next)
  }
  const keyboard = () => {
    changeMode('keyboard')
    afterRender(() => latest.current.textareaRef?.current?.focus())
  }
  const voice = mode === 'voice'
  return {
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
            <AudioLines size={18} strokeWidth={2} />
          )}
        </button>
        {notice ? (
          <p className="dictation-notice" role="status">
            {notice}
          </p>
        ) : null}
      </>
    ),
    bar: voice ? (
      <HoldToTalk
        surface={options.surface}
        draft={() => latest.current.draft()}
        canSend={Boolean(options.onSend)}
        onNotice={setNotice}
        onSend={(text) => latest.current.onSend?.(text)}
        // Inserted text is there to be edited: show the text box first.
        onInsert={(text, at) => {
          changeMode('keyboard')
          afterRender(() => latest.current.onInsert(text, at))
        }}
      />
    ) : null,
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

export function HoldToTalk({
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
}) {
  const t = useT()
  const { state, engine, start, stop, cancel, reset } = useDictation()
  const [hold, setHold] = useState<Hold>()
  const [locked, setLocked] = useState<Locked>()
  /** Redraws the locked clock. */
  const [now, setNow] = useState(() => Date.now())
  /** Set from release until the transcript lands, with the release zone. */
  const [finishing, setFinishing] = useState<HoldZone>()
  const [layout, setLayout] = useState<HoldLayout>()
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

  const press = (pointerId: number) => {
    const settings = loadSpeechSettings()
    if (!engineChain(settings).length) {
      setSetupNeeded(true)
      return
    }
    latest.current.onNotice('')
    setLevels([])
    setRelease(canSend ? settings.release[surface] : 'insert')
    setLayout(holdLayout(window.innerWidth, window.innerHeight, safeBottom()))
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

  return (
    <>
      <button
        type="button"
        className="voice-hold-bar"
        data-active={Boolean(hold)}
        onPointerDown={(event) => {
          if (event.button > 0 || hold || locked || finishing) return
          event.preventDefault()
          event.currentTarget.setPointerCapture?.(event.pointerId)
          press(event.pointerId)
        }}
        onPointerMove={(event) => {
          if (event.pointerId === hold?.pointerId)
            move(event.clientX, event.clientY)
        }}
        onPointerUp={(event) => {
          if (event.pointerId === hold?.pointerId) letGo()
        }}
        // The system took the pointer (the mic permission dialog, a call
        // taking the screen, a system gesture): no real release happened.
        // Before there is speech worth keeping, drop the dictation; after,
        // keep it, as Android may cancel the finger before the page hides.
        onPointerCancel={(event) => {
          if (event.pointerId !== hold?.pointerId) return
          if (
            state.phase === 'recording' &&
            Date.now() - hold.pressedAt >= MIN_HOLD_MS
          )
            return stopSafely('interrupted')
          dismiss()
          cancel()
        }}
        onContextMenu={(event) => event.preventDefault()}
      >
        {t('speech.hold.bar')}
      </button>
      {zone && layout ? (
        <HoldOverlay
          layout={layout}
          zone={zone}
          finishing={Boolean(finishing)}
          release={release}
          transcript={transcript}
          levels={levels}
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
}
