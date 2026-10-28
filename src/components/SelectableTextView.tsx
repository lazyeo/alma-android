import { AtSign, Copy, Quote } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { copyText } from '../clipboard'
import { haptic } from '../haptics'
import { setNativeSelectionActions } from '../nativeBridge'
import { isNativePlatform } from '../nativeRuntime'
import { selectionTextWithin } from './selection'
import { useAnimatedOverlay } from './useAnimatedOverlay'
import { useT } from '../i18n'

/** The system toolbar posts these when its Quote/Mention items are tapped. */
export const SELECTION_ACTION_EVENT = 'almaselectionaction'

/**
 * Full-screen reader for one message. The rendered text stays natively
 * selectable. In the app, Quote and Mention join Android's own selection
 * toolbar (MainActivity.onActionModeStarted); on the web a bottom bar offers
 * Copy/Quote/Mention instead.
 */
export function SelectableTextView({
  children,
  onQuote,
  onMention,
  onClose,
}: {
  children: ReactNode
  onQuote?(text: string): void
  /** Resolves once the reference is in the composer; rejects with a reason. */
  onMention?(text: string): Promise<void>
  onClose(): void
}) {
  const t = useT()
  const dialog = useRef<HTMLDialogElement>(null)
  const content = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState('')
  // The system toolbar ends the selection as it closes; keep the last one.
  const lastSelection = useRef('')
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const native = isNativePlatform()
  const { closing, requestClose, finishClose } = useAnimatedOverlay(
    true,
    onClose,
  )
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialog.current?.showModal()
    return () => {
      document.body.style.overflow = overflow
      // A Quote/Mention moves focus to the composer; don't take it back.
      const active = document.activeElement
      if (
        previous?.isConnected &&
        (!active ||
          active === document.body ||
          dialog.current?.contains(active))
      )
        previous.focus()
    }
  }, [])
  useEffect(() => {
    const update = () => {
      const text = selectionTextWithin(document.getSelection(), content.current)
      if (text.trim()) lastSelection.current = text
      setSelection(text)
      setCopied(false)
      setError('')
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [])

  const quote = (text: string) => {
    if (!onQuote || !text.trim()) return
    void haptic('light')
    onQuote(text)
    requestClose()
  }
  const mention = (text: string) => {
    if (!onMention || !text.trim() || busy) return
    void haptic('light')
    setBusy(true)
    setError('')
    onMention(text)
      .then(() => requestClose())
      .catch((cause) =>
        setError(
          cause instanceof Error && cause.message
            ? cause.message
            : t('message.select.mentionFailed'),
        ),
      )
      .finally(() => setBusy(false))
  }
  const actions = useRef({ quote, mention })
  actions.current = { quote, mention }
  useEffect(() => {
    void setNativeSelectionActions(true)
    const onAction = (event: Event) => {
      const action = (event as CustomEvent<string>).detail
      const text = lastSelection.current
      if (action === 'quote') actions.current.quote(text)
      else if (action === 'mention') actions.current.mention(text)
    }
    window.addEventListener(SELECTION_ACTION_EVENT, onAction)
    return () => {
      window.removeEventListener(SELECTION_ACTION_EVENT, onAction)
      void setNativeSelectionActions(false)
    }
  }, [])

  const hasSelection = selection.trim().length > 0
  return createPortal(
    <dialog
      ref={dialog}
      className={`select-text-view${closing ? ' closing' : ''}`}
      aria-label={t('message.select.title')}
      onAnimationEnd={(event) => {
        if (closing && event.target === event.currentTarget) finishClose()
      }}
      onCancel={(event) => {
        event.preventDefault()
        requestClose()
      }}
    >
      <header>
        <h2>{t('message.select.title')}</h2>
        <button
          autoFocus
          onClick={() => {
            void haptic('light')
            requestClose()
          }}
        >
          {t('common.done')}
        </button>
      </header>
      <div ref={content} className="selectable-message" tabIndex={0}>
        {children}
      </div>
      {native && !error && !busy ? null : (
        <footer
          className="select-text-actions"
          aria-label={t('message.select.actions')}
        >
          {error ? (
            <p className="select-text-error" role="alert">
              {error}
            </p>
          ) : native && busy ? (
            <p className="select-text-status" role="status">
              {t('message.select.mentioning')}
            </p>
          ) : null}
          {native ? null : (
            <div className="select-text-buttons">
              <button
                disabled={!hasSelection}
                onClick={() => {
                  void haptic('light')
                  void copyText(selection).then(() => setCopied(true))
                }}
              >
                <Copy size={16} aria-hidden="true" />
                {copied ? t('common.copied') : t('common.copy')}
              </button>
              {onQuote ? (
                <button
                  disabled={!hasSelection}
                  onClick={() => quote(selection)}
                >
                  <Quote size={16} aria-hidden="true" />
                  {t('message.select.quote')}
                </button>
              ) : null}
              {onMention ? (
                <button
                  disabled={!hasSelection || busy}
                  onClick={() => mention(selection)}
                >
                  <AtSign size={16} aria-hidden="true" />
                  {busy
                    ? t('message.select.mentioning')
                    : t('message.select.mention')}
                </button>
              ) : null}
            </div>
          )}
        </footer>
      )}
    </dialog>,
    document.body,
  )
}
