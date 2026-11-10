import { Mic } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import {
  decideDelivery,
  holdZone,
  type DictationAction,
  type HoldZone,
} from './delivery'
import { DictationSheet } from './DictationSheet'
import {
  engineChain,
  loadSpeechSettings,
  resolveEngine,
  type DictationSurface,
} from './engineStore'
import { insertDictation, type Insertion } from './insertText'
import { speechAvailable } from './nativeSpeech'
import { useDictation } from './useDictation'

/** Holding at least this long is push-to-talk: release finishes it. */
export const HOLD_MS = 350
/** How long a held-back send's explanation stays up. */
export const NOTICE_MS = 3500

type MicButtonProps = {
  /** Picks the "after release" setting (Settings → Voice input). */
  surface: DictationSurface
  /** The composer's current text, for the held-back-send rules. */
  draft(): string
  /** Puts text into the composer at the caret or after its text. */
  onInsert(text: string, at: 'caret' | 'end'): void
  /** Sends through the composer's own send path; absent → insert only. */
  onSend?(text: string): void
  disabled?: boolean
  className?: string
}

/**
 * Where dictated text lands in a composer: at its caret, replacing any
 * selection (the textarea keeps both while the sheet has focus), or after
 * everything already typed.
 */
export function dictationInsertion(
  area: HTMLTextAreaElement | null,
  value: string,
  text: string,
  at: 'caret' | 'end' = 'caret',
): Insertion {
  if (at === 'end')
    return insertDictation(value, value.length, value.length, text)
  return insertDictation(
    value,
    area?.selectionStart ?? value.length,
    area?.selectionEnd ?? value.length,
    text,
  )
}

/** The web build has no native recorder, so there is no button at all. */
export function MicButton(props: MicButtonProps) {
  return speechAvailable() ? <DictationButton {...props} /> : null
}

function DictationButton({
  surface,
  draft,
  onInsert,
  onSend,
  disabled,
  className,
}: MicButtonProps) {
  const t = useT()
  const { state, start, stop, cancel, reset } = useDictation()
  const [open, setOpen] = useState(false)
  // Resolved on every open, so the sheet names what this dictation uses.
  const [engine, setEngine] = useState(() =>
    resolveEngine(loadSpeechSettings()),
  )
  const [releaseAction, setReleaseAction] = useState<DictationAction>('send')
  const [setupNeeded, setSetupNeeded] = useState(false)
  /** Where the held finger is; undefined when not holding. */
  const [zone, setZone] = useState<HoldZone>()
  const [notice, setNotice] = useState('')
  const holdTimer = useRef<number>()
  const holding = useRef(false)
  const pressAt = useRef({ x: 0, y: 0 })
  // The click that follows a push-to-talk release is not a tap.
  const swallowClick = useRef(false)
  /** What to do with the result; chosen on release or by a sheet button. */
  const pendingAction = useRef<DictationAction>()
  // Released while still starting: stop as soon as recording begins.
  const stopWhenRecording = useRef(false)
  const callbacks = useRef({ draft, onInsert, onSend })
  callbacks.current = { draft, onInsert, onSend }
  const canSend = Boolean(onSend)

  const begin = () => {
    stopWhenRecording.current = false
    pendingAction.current = undefined
    setNotice('')
    const settings = loadSpeechSettings()
    const chain = engineChain(settings)
    const ready = chain.length > 0
    setEngine(chain[0] ?? resolveEngine(settings))
    setReleaseAction(settings.release[surface])
    setSetupNeeded(!ready)
    setOpen(true)
    if (ready) start()
  }
  const close = () => {
    stopWhenRecording.current = false
    pendingAction.current = undefined
    holding.current = false
    setZone(undefined)
    setOpen(false)
    setSetupNeeded(false)
    cancel()
  }
  const finish = (action: DictationAction) => {
    pendingAction.current = action
    if (state.phase === 'recording') stop()
    else stopWhenRecording.current = true
  }
  const deliver = (action: DictationAction, text: string) => {
    const { draft, onInsert, onSend } = callbacks.current
    const delivery = decideDelivery(onSend ? action : 'insert', text, draft())
    if (delivery.kind === 'send') {
      onSend?.(delivery.text)
      return
    }
    onInsert(delivery.text, delivery.at)
    if (delivery.heldBack) setNotice(t(`speech.notice.${delivery.heldBack}`))
  }

  useEffect(() => {
    if (state.phase === 'done') {
      // A recording that hit the length cap was never told what to do:
      // putting it in the composer is the safe choice.
      deliver(pendingAction.current ?? 'insert', state.text)
      pendingAction.current = undefined
      void haptic('selection')
      reset()
      setOpen(false)
    } else if (state.phase === 'recording' && stopWhenRecording.current) {
      stopWhenRecording.current = false
      stop()
    } else if (state.phase === 'error') {
      stopWhenRecording.current = false
      holding.current = false
      setZone(undefined)
    }
    // deliver reads the latest props through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, reset, stop])

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(''), NOTICE_MS)
    return () => window.clearTimeout(timer)
  }, [notice])

  useEffect(() => () => window.clearTimeout(holdTimer.current), [])

  const release = () => {
    window.clearTimeout(holdTimer.current)
    holdTimer.current = undefined
    if (!holding.current) return
    holding.current = false
    swallowClick.current = true
    const where = zone ?? 'release'
    setZone(undefined)
    void haptic('light')
    if (where === 'cancel') return close()
    finish(where === 'edit' ? 'insert' : releaseAction)
  }

  // The system took the pointer (the mic permission dialog, a system
  // gesture): no real release happened, so carry on as a tap and let the
  // sheet's buttons finish the dictation.
  const keepRecording = () => {
    window.clearTimeout(holdTimer.current)
    holdTimer.current = undefined
    if (!holding.current) return
    holding.current = false
    swallowClick.current = true
    setZone(undefined)
  }

  return (
    <>
      <button
        type="button"
        className={`quiet-icon-button mic-button${className ? ` ${className}` : ''}`}
        aria-label={t('speech.mic')}
        aria-haspopup="dialog"
        disabled={disabled}
        onPointerDown={(event) => {
          if (event.button > 0) return
          swallowClick.current = false
          holding.current = false
          pressAt.current = { x: event.clientX, y: event.clientY }
          event.currentTarget.setPointerCapture?.(event.pointerId)
          window.clearTimeout(holdTimer.current)
          holdTimer.current = window.setTimeout(() => {
            holdTimer.current = undefined
            holding.current = true
            setZone('release')
            void haptic('medium')
            begin()
          }, HOLD_MS)
        }}
        onPointerMove={(event) => {
          if (!holding.current) return
          const next = holdZone(
            event.clientX - pressAt.current.x,
            event.clientY - pressAt.current.y,
          )
          if (next === zone) return
          setZone(next)
          void haptic('selection')
        }}
        onPointerUp={release}
        onPointerCancel={keepRecording}
        onContextMenu={(event) => event.preventDefault()}
        onClick={() => {
          if (swallowClick.current) {
            swallowClick.current = false
            return
          }
          void haptic('light')
          begin()
        }}
      >
        <Mic size={16} strokeWidth={2} />
      </button>
      {notice ? (
        <p className="dictation-notice" role="status">
          {notice}
        </p>
      ) : null}
      {open ? (
        <DictationSheet
          state={state}
          engine={engine}
          setupNeeded={setupNeeded}
          hold={
            zone
              ? { zone, release: canSend ? releaseAction : 'insert' }
              : undefined
          }
          canSend={canSend}
          onFinish={(action) => {
            void haptic('light')
            finish(action)
          }}
          onCancel={close}
          onRetry={begin}
          onInsert={(text) => {
            callbacks.current.onInsert(text, 'caret')
            reset()
            setOpen(false)
          }}
        />
      ) : null}
    </>
  )
}
