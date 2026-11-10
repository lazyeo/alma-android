import { AudioLines, Keyboard } from 'lucide-react'
import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import {
  decideDelivery,
  releaseOutcome,
  type DictationAction,
} from './delivery'
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
    const timer = window.setTimeout(() => setNotice(''), NOTICE_MS)
    return () => window.clearTimeout(timer)
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
    setFinishing(undefined)
    stopWhenRecording.current = false
    pendingAction.current = undefined
  }

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
    if (!hold) return
    const outcome = releaseOutcome(
      hold.zone,
      Date.now() - hold.pressedAt,
      release,
    )
    void haptic('light')
    if (outcome === 'cancel' || outcome === 'too_short') {
      dismiss()
      cancel()
      if (outcome === 'too_short')
        latest.current.onNotice(t('speech.notice.tooShort'))
      return
    }
    setHold(undefined)
    setFinishing(hold.zone)
    pendingAction.current = outcome
    if (state.phase === 'recording') stop()
    else stopWhenRecording.current = true
  }

  useEffect(() => {
    if (state.phase === 'recording') {
      setLevels((current) => [...current, state.level].slice(-WAVE_BARS))
      if (stopWhenRecording.current) {
        stopWhenRecording.current = false
        stop()
      }
    } else if (state.phase === 'done') {
      // A recording that hit the length cap was never released: putting
      // it in the composer is the safe choice.
      deliver(pendingAction.current ?? 'insert', state.text)
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
  const zone = hold?.zone ?? finishing

  return (
    <>
      <button
        type="button"
        className="voice-hold-bar"
        data-active={Boolean(hold)}
        onPointerDown={(event) => {
          if (event.button > 0 || hold || finishing) return
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
        // The system took the pointer (the mic permission dialog, a system
        // gesture): no real release happened, so drop the dictation.
        onPointerCancel={(event) => {
          if (event.pointerId !== hold?.pointerId) return
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
