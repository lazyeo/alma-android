import { Mic } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import { DictationSheet } from './DictationSheet'
import { engineChain, loadSpeechSettings, resolveEngine } from './engineStore'
import { insertDictation, type Insertion } from './insertText'
import { speechAvailable } from './nativeSpeech'
import { useDictation } from './useDictation'

/** Holding at least this long is push-to-talk: release stops and inserts. */
export const HOLD_MS = 350

type MicButtonProps = {
  /** Receives the recognised text to insert. Dictation never sends. */
  onText(text: string): void
  disabled?: boolean
  className?: string
}

/**
 * Where dictated text lands in a composer: at its caret, replacing any
 * selection (the textarea keeps both while the sheet has focus).
 */
export function dictationInsertion(
  area: HTMLTextAreaElement | null,
  value: string,
  text: string,
): Insertion {
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

function DictationButton({ onText, disabled, className }: MicButtonProps) {
  const t = useT()
  const { state, start, stop, cancel, reset } = useDictation()
  const [open, setOpen] = useState(false)
  // Resolved on every open, so the sheet names what this dictation uses.
  const [engine, setEngine] = useState(() =>
    resolveEngine(loadSpeechSettings()),
  )
  const [setupNeeded, setSetupNeeded] = useState(false)
  const holdTimer = useRef<number>()
  const holding = useRef(false)
  // The click that follows a push-to-talk release is not a tap.
  const swallowClick = useRef(false)
  // Released while still starting: stop as soon as recording begins.
  const stopWhenRecording = useRef(false)
  const onTextRef = useRef(onText)
  onTextRef.current = onText

  const begin = () => {
    stopWhenRecording.current = false
    // Custom has nothing to call until Settings has a base URL and model.
    const settings = loadSpeechSettings()
    const chain = engineChain(settings)
    const ready = chain.length > 0
    setEngine(chain[0] ?? resolveEngine(settings))
    setSetupNeeded(!ready)
    setOpen(true)
    if (ready) start()
  }
  const close = () => {
    stopWhenRecording.current = false
    setOpen(false)
    setSetupNeeded(false)
    cancel()
  }

  useEffect(() => {
    if (state.phase === 'done') {
      onTextRef.current(state.text)
      void haptic('selection')
      reset()
      setOpen(false)
    } else if (state.phase === 'recording' && stopWhenRecording.current) {
      stopWhenRecording.current = false
      stop()
    } else if (state.phase === 'error') {
      stopWhenRecording.current = false
    }
  }, [state, reset, stop])

  useEffect(() => () => window.clearTimeout(holdTimer.current), [])

  const release = () => {
    window.clearTimeout(holdTimer.current)
    holdTimer.current = undefined
    if (!holding.current) return
    holding.current = false
    swallowClick.current = true
    void haptic('light')
    if (state.phase === 'recording') stop()
    else stopWhenRecording.current = true
  }

  // The system took the pointer (the mic permission dialog, a system
  // gesture): no real release happened, so carry on as a tap and let the
  // sheet's Stop finish the dictation.
  const keepRecording = () => {
    window.clearTimeout(holdTimer.current)
    holdTimer.current = undefined
    if (!holding.current) return
    holding.current = false
    swallowClick.current = true
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
          event.currentTarget.setPointerCapture?.(event.pointerId)
          window.clearTimeout(holdTimer.current)
          holdTimer.current = window.setTimeout(() => {
            holdTimer.current = undefined
            holding.current = true
            void haptic('medium')
            begin()
          }, HOLD_MS)
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
      {open ? (
        <DictationSheet
          state={state}
          engine={engine}
          setupNeeded={setupNeeded}
          onStop={() => {
            void haptic('light')
            stop()
          }}
          onCancel={close}
          onRetry={begin}
          onInsert={(text) => {
            onTextRef.current(text)
            reset()
            setOpen(false)
          }}
        />
      ) : null}
    </>
  )
}
