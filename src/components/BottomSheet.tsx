import { haptic } from '../haptics'
import { shouldFinishOverlayClose } from '../overlayClosing'
import { ArrowLeft, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useAnimatedOverlay } from './useAnimatedOverlay'
import { useT } from '../i18n'

// Dragging the handle further than this dismisses the sheet; shorter drags
// snap back so an accidental touch never closes it.
const DISMISS_DRAG_PX = 80

export function BottomSheet({
  title,
  titleMeta,
  label = title,
  className = '',
  onClose,
  onBack,
  footer,
  children,
}: {
  title: string
  titleMeta?: ReactNode
  label?: string
  className?: string
  onClose: () => void
  onBack?: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  const t = useT()
  const sheetRef = useRef<HTMLElement>(null)
  const [dragY, setDragY] = useState(0)
  const dragStart = useRef<number>()
  const { closing, requestClose, finishClose } = useAnimatedOverlay(
    true,
    onClose,
  )

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (onBack) onBack()
        else requestClose()
      }
      if (event.key === 'Tab') {
        const items = [
          ...(sheetRef.current?.querySelectorAll<HTMLElement>(
            'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex="0"]',
          ) ?? []),
        ].filter((item) => item.getClientRects().length)
        const first = items[0],
          last = items.at(-1)
        if (!first) {
          event.preventDefault()
          sheetRef.current?.focus()
          return
        }
        if (
          event.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === sheetRef.current)
        ) {
          event.preventDefault()
          last?.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    if (!sheetRef.current?.contains(document.activeElement))
      sheetRef.current?.focus()
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      if (previous?.isConnected) previous.focus()
    }
  }, [onBack, requestClose])

  return (
    <div
      className={`sheet-backdrop${closing ? ' closing' : ''}`}
      onClick={requestClose}
      onAnimationEnd={(event) => {
        if (
          shouldFinishOverlayClose(closing, event.target, event.currentTarget)
        )
          finishClose()
      }}
    >
      <section
        ref={sheetRef}
        tabIndex={-1}
        className={`bottom-sheet ${className}`}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="sheet-handle"
          aria-hidden="true"
          onPointerDown={(event) => {
            dragStart.current = event.clientY
            event.currentTarget.setPointerCapture(event.pointerId)
          }}
          onPointerMove={(event) => {
            if (dragStart.current === undefined) return
            setDragY(Math.max(0, event.clientY - dragStart.current))
          }}
          onPointerUp={() => {
            dragStart.current = undefined
            void haptic('selection')
            if (dragY > DISMISS_DRAG_PX) requestClose()
            else setDragY(0)
          }}
          onPointerCancel={() => {
            dragStart.current = undefined
            setDragY(0)
          }}
        >
          <span />
        </div>
        <header>
          {onBack ? (
            <button onClick={onBack} aria-label={t('common.back')}>
              <ArrowLeft size={20} strokeWidth={2} />
            </button>
          ) : null}
          <h2>
            <span>{title}</span>
            {titleMeta ? (
              <span className="sheet-title-meta">{titleMeta}</span>
            ) : null}
          </h2>
          <button onClick={requestClose} aria-label={t('common.close')}>
            <X size={20} strokeWidth={2} />
          </button>
        </header>
        <div className="sheet-body">{children}</div>
        {footer ? <footer className="sheet-footer">{footer}</footer> : null}
      </section>
    </div>
  )
}
