import { ArrowUp, Trash2 } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MutableRefObject,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  PRESENCE_EXIT_MS,
  presenceClass,
  usePresence,
} from '../components/usePresence'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import { parseMaterializedReferences } from './references'
import {
  commitQueuedMessageEdit,
  moveQueuedMessageToIndex,
  queueDragTargetIndex,
  removeQueuedMessage,
  type QueuedMessage,
} from './threadQueue'

const ICON = { size: 16, strokeWidth: 2 } as const
const DRAG_HOLD_MS = 300
const DRAG_CANCEL_PX = 8
const EDGE_SCROLL_PX = 48
const MAX_AUTO_SCROLL_PX = 9

type QueuePanelProps = {
  messages: QueuedMessage[]
  disabled: boolean
  generating: boolean
  onSendNow(): void
  onUpdate(messages: QueuedMessage[]): void
  onSteer(message: QueuedMessage): void
  onEditingChange?(editing: boolean): void
}

type DragState = {
  id: string
  pointerId: number
  startY: number
  pointerY: number
  fromIndex: number
  targetIndex: number
  rowHeight: number
}

type PendingHold = {
  id: string
  pointerId: number
  startX: number
  startY: number
  element: HTMLElement
  timer: number
  startScrollTop: number
  scrolling: boolean
}

export function QueuePanel({
  messages,
  disabled,
  generating,
  onSendNow,
  onUpdate,
  onSteer,
  onEditingChange,
}: QueuePanelProps) {
  const t = useT()
  const [editingId, setEditingId] = useState<string>()
  const [editText, setEditText] = useState('')
  const [renderedMessages, setRenderedMessages] = useState(messages)
  const [exitingIds, setExitingIds] = useState<Set<string>>(new Set())
  const previousMessages = useRef(messages)
  const exitTimers = useRef(new Map<string, number>())
  const [drag, setDrag] = useState<DragState>()
  const dragRef = useRef<DragState>()
  const pendingHold = useRef<PendingHold>()
  const touchPointerId = useRef<number>()
  const listRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef(new Map<string, HTMLElement>())
  const suppressClick = useRef(false)
  const autoScrollFrame = useRef(0)
  const [overflowing, setOverflowing] = useState(false)

  dragRef.current = drag

  useEffect(() => {
    const previous = previousMessages.current
    const currentIds = new Set(messages.map((message) => message.id))
    const removed = previous.filter((message) => !currentIds.has(message.id))
    previousMessages.current = messages
    setRenderedMessages(removed.length ? previous : messages)
    if (removed.length) {
      setExitingIds((current) => {
        const next = new Set(current)
        removed.forEach((message) => next.add(message.id))
        return next
      })
      removed.forEach((message) => {
        window.clearTimeout(exitTimers.current.get(message.id))
        exitTimers.current.set(
          message.id,
          window.setTimeout(() => {
            setRenderedMessages(messages)
            setExitingIds((current) => {
              const next = new Set(current)
              next.delete(message.id)
              return next
            })
            exitTimers.current.delete(message.id)
          }, PRESENCE_EXIT_MS),
        )
      })
    }
  }, [messages])
  useEffect(
    () => () => {
      exitTimers.current.forEach((timer) => window.clearTimeout(timer))
    },
    [],
  )

  useEffect(() => {
    onEditingChange?.(Boolean(editingId))
    return () => onEditingChange?.(false)
  }, [editingId, onEditingChange])
  useEffect(() => {
    if (editingId && !messages.some((message) => message.id === editingId)) {
      setEditingId(undefined)
      setEditText('')
    }
  }, [editingId, messages])

  const measureOverflow = useCallback(() => {
    const list = listRef.current
    setOverflowing(Boolean(list && list.scrollHeight > list.clientHeight + 1))
  }, [])
  useLayoutEffect(measureOverflow, [messages, editingId, measureOverflow])
  useEffect(() => {
    window.addEventListener('resize', measureOverflow)
    return () => window.removeEventListener('resize', measureOverflow)
  }, [measureOverflow])

  const startEditing = (message: QueuedMessage) => {
    if (suppressClick.current || dragRef.current) return
    setEditingId(message.id)
    setEditText(message.content)
  }
  const cancelEditing = () => {
    setEditingId(undefined)
    setEditText('')
  }
  const saveEditing = () => {
    if (!editingId) return
    const next = commitQueuedMessageEdit(messages, editingId, editText)
    if (next !== messages) onUpdate(next)
    cancelEditing()
  }
  const handleEditorKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelEditing()
      return
    }
    const plainEnterSaves =
      event.key === 'Enter' &&
      !event.shiftKey &&
      window.matchMedia('(pointer: fine)').matches
    if (
      event.key === 'Enter' &&
      (event.metaKey || event.ctrlKey || plainEnterSaves)
    ) {
      event.preventDefault()
      saveEditing()
    }
  }

  const clearPendingHold = useCallback(() => {
    if (!pendingHold.current) return
    window.clearTimeout(pendingHold.current.timer)
    pendingHold.current = undefined
  }, [])

  const rowMidpointsWithout = useCallback(
    (dragId: string) => {
      return messages.flatMap((message) => {
        if (message.id === dragId) return []
        const rect = rowRefs.current.get(message.id)?.getBoundingClientRect()
        return rect ? [rect.top + rect.height / 2] : []
      })
    },
    [messages],
  )

  const updateDragTarget = useCallback(
    (pointerY: number) => {
      const current = dragRef.current
      if (!current) return
      const targetIndex = queueDragTargetIndex(
        pointerY,
        rowMidpointsWithout(current.id),
      )
      if (targetIndex === current.targetIndex) return
      const next = { ...current, pointerY, targetIndex }
      dragRef.current = next
      setDrag(next)
      void haptic('selection')
    },
    [rowMidpointsWithout],
  )

  const runAutoScroll = useCallback(() => {
    cancelAnimationFrame(autoScrollFrame.current)
    const tick = () => {
      const current = dragRef.current
      const list = listRef.current
      if (!current || !list) return
      const rect = list.getBoundingClientRect()
      const topDistance = current.pointerY - rect.top
      const bottomDistance = rect.bottom - current.pointerY
      let delta = 0
      if (topDistance < EDGE_SCROLL_PX)
        delta =
          -MAX_AUTO_SCROLL_PX * (1 - Math.max(0, topDistance) / EDGE_SCROLL_PX)
      else if (bottomDistance < EDGE_SCROLL_PX)
        delta =
          MAX_AUTO_SCROLL_PX *
          (1 - Math.max(0, bottomDistance) / EDGE_SCROLL_PX)
      if (delta) {
        list.scrollTop += delta
        updateDragTarget(current.pointerY)
      }
      autoScrollFrame.current = requestAnimationFrame(tick)
    }
    autoScrollFrame.current = requestAnimationFrame(tick)
  }, [updateDragTarget])

  const finishDrag = useCallback(
    (cancelled = false) => {
      const current = dragRef.current
      if (!current) return
      cancelAnimationFrame(autoScrollFrame.current)
      dragRef.current = undefined
      setDrag(undefined)
      suppressClick.current = true
      window.setTimeout(() => {
        suppressClick.current = false
      }, 350)
      if (!cancelled && current.targetIndex !== current.fromIndex)
        onUpdate(
          moveQueuedMessageToIndex(messages, current.id, current.targetIndex),
        )
    },
    [messages, onUpdate],
  )

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const pending = pendingHold.current
      if (pending && event.pointerId === pending.pointerId) {
        const distance = Math.hypot(
          event.clientX - pending.startX,
          event.clientY - pending.startY,
        )
        if (distance > DRAG_CANCEL_PX) clearPendingHold()
      }
      const current = dragRef.current
      if (!current || event.pointerId !== current.pointerId) return
      event.preventDefault()
      const next = { ...current, pointerY: event.clientY }
      dragRef.current = next
      setDrag(next)
      updateDragTarget(event.clientY)
    }
    const onUp = (event: PointerEvent) => {
      if (pendingHold.current?.pointerId === event.pointerId) clearPendingHold()
      if (dragRef.current?.pointerId === event.pointerId) finishDrag(false)
    }
    const onCancel = (event: PointerEvent) => {
      if (pendingHold.current?.pointerId === event.pointerId) clearPendingHold()
      if (dragRef.current?.pointerId === event.pointerId) finishDrag(true)
    }
    window.addEventListener('pointermove', onMove, { passive: false })
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
    }
  }, [clearPendingHold, finishDrag, updateDragTarget])
  useEffect(() => {
    const list = listRef.current
    if (!list) return
    const onScroll = () => {
      const pending = pendingHold.current
      if (!pending || dragRef.current || pending.scrolling) return
      if (Math.abs(list.scrollTop - pending.startScrollTop) > 1)
        clearPendingHold()
    }
    list.addEventListener('scroll', onScroll, { passive: true })
    return () => list.removeEventListener('scroll', onScroll)
  }, [clearPendingHold])
  useEffect(
    () => () => {
      clearPendingHold()
      cancelAnimationFrame(autoScrollFrame.current)
    },
    [clearPendingHold],
  )

  const beginHold = (
    message: QueuedMessage,
    index: number,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (
      disabled ||
      editingId ||
      event.button !== 0 ||
      (event.target as Element).closest('.queue-actions, textarea, input, a')
    )
      return
    clearPendingHold()
    const element = event.currentTarget
    const pointerId = event.pointerId
    const startX = event.clientX
    const startY = event.clientY
    const timer = window.setTimeout(() => {
      const pending = pendingHold.current
      if (!pending || pending.pointerId !== pointerId) return
      pendingHold.current = undefined
      const rect = element.getBoundingClientRect()
      element.setPointerCapture?.(pointerId)
      const next: DragState = {
        id: message.id,
        pointerId,
        startY,
        pointerY: startY,
        fromIndex: index,
        targetIndex: index,
        rowHeight: rect.height,
      }
      suppressClick.current = true
      dragRef.current = next
      setDrag(next)
      void haptic('medium')
      runAutoScroll()
    }, DRAG_HOLD_MS)
    pendingHold.current = {
      id: message.id,
      pointerId,
      startX,
      startY,
      element,
      timer,
      startScrollTop: listRef.current?.scrollTop ?? 0,
      scrolling: false,
    }
  }

  return (
    <section
      className={`queue-panel${drag ? ' is-dragging' : ''}`}
      aria-label={t('composer.queue.title')}
      aria-disabled={disabled}
    >
      <header className="queue-header">
        <span>{t('composer.queue.count', { count: messages.length })}</span>
        <button
          type="button"
          className="queue-send-now"
          disabled={disabled}
          aria-label={t('composer.queue.sendNowLabel')}
          onClick={() => {
            void haptic('light')
            onSendNow()
          }}
        >
          <ArrowUp {...ICON} />
          <span>{t('composer.queue.sendNow')}</span>
        </button>
      </header>
      <div
        ref={listRef}
        className={`queue-scroll${overflowing ? ' overflowing' : ''}`}
        data-queue-order={messages.map((message) => message.id).join(',')}
        onTouchMove={(event) => {
          const touch = event.touches[0]
          if (!touch) return
          const current = dragRef.current
          if (current) {
            event.preventDefault()
            const next = { ...current, pointerY: touch.clientY }
            dragRef.current = next
            setDrag(next)
            updateDragTarget(touch.clientY)
            return
          }
          const pending = pendingHold.current
          if (!pending) return
          const distance = Math.hypot(
            touch.clientX - pending.startX,
            touch.clientY - pending.startY,
          )
          if (distance > DRAG_CANCEL_PX) clearPendingHold()
        }}
        onTouchEnd={() => {
          touchPointerId.current = undefined
          clearPendingHold()
          if (dragRef.current) finishDrag(false)
        }}
        onTouchCancel={() => {
          touchPointerId.current = undefined
          clearPendingHold()
          if (dragRef.current) finishDrag(true)
        }}
      >
        <div className="queue-list">
          {renderedMessages.map((message) => {
            const index = messages.findIndex((item) => item.id === message.id)
            return (
              <QueuePresenceRow
                key={message.id}
                message={message}
                index={index}
                visible={!exitingIds.has(message.id)}
                disabled={disabled}
                generating={generating}
                editing={editingId === message.id}
                editText={editText}
                drag={drag}
                touchPointerId={touchPointerId}
                setRowRef={(node) => {
                  if (node) rowRefs.current.set(message.id, node)
                  else rowRefs.current.delete(message.id)
                }}
                onPointerDown={(event) => beginHold(message, index, event)}
                onEditText={setEditText}
                onEdit={() => startEditing(message)}
                onBlur={saveEditing}
                onEditorKeyDown={handleEditorKeyDown}
                onSteer={() => onSteer(message)}
                onDelete={() =>
                  onUpdate(removeQueuedMessage(messages, message.id))
                }
              />
            )
          })}
        </div>
      </div>
    </section>
  )
}

function QueuePresenceRow(props: QueueRowProps & { visible: boolean }) {
  const { visible, ...rowProps } = props
  const presence = usePresence(visible)
  if (!presence.rendered) return null
  return <QueueRow {...rowProps} presence={presenceClass(presence.phase)} />
}

type QueueRowProps = {
  message: QueuedMessage
  index: number
  disabled: boolean
  generating: boolean
  editing: boolean
  editText: string
  drag?: DragState
  touchPointerId: MutableRefObject<number | undefined>
  setRowRef(node: HTMLElement | null): void
  onPointerDown(event: ReactPointerEvent<HTMLElement>): void
  onEditText(value: string): void
  onEdit(): void
  onBlur(): void
  onEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void
  onSteer(): void
  onDelete(): void
}

function QueueRow({
  message,
  index,
  disabled,
  generating,
  editing,
  editText,
  drag,
  touchPointerId,
  setRowRef,
  onPointerDown,
  onEditText,
  onEdit,
  onBlur,
  onEditorKeyDown,
  onSteer,
  onDelete,
  presence,
}: QueueRowProps & { presence: string }) {
  const t = useT()
  const editorRef = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    if (!editing || !editorRef.current) return
    const editor = editorRef.current
    editor.focus()
    editor.setSelectionRange(editor.value.length, editor.value.length)
  }, [editing])
  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor) return
    editor.style.height = '0px'
    editor.style.height = `${editor.scrollHeight}px`
  }, [editText, editing])

  let translateY = 0
  const dragging = drag?.id === message.id
  if (dragging) translateY = drag.pointerY - drag.startY
  else if (drag) {
    if (
      drag.targetIndex > drag.fromIndex &&
      index > drag.fromIndex &&
      index <= drag.targetIndex
    )
      translateY = -drag.rowHeight
    if (
      drag.targetIndex < drag.fromIndex &&
      index >= drag.targetIndex &&
      index < drag.fromIndex
    )
      translateY = drag.rowHeight
  }

  return (
    <article
      ref={setRowRef}
      className={`queue-item ${presence}${editing ? ' editing' : ''}${dragging ? ' dragging' : ''}`}
      style={
        translateY ? { transform: `translateY(${translateY}px)` } : undefined
      }
      data-queue-id={message.id}
      onPointerDown={(event) => {
        if (touchPointerId.current !== undefined) return
        onPointerDown(event)
      }}
      onTouchStart={(event) => {
        const touch = event.touches[0]
        if (!touch) return
        const pointerId = touch.identifier + 1
        touchPointerId.current = pointerId
        onPointerDown({
          button: 0,
          pointerId,
          clientX: touch.clientX,
          clientY: touch.clientY,
          target: event.target,
          currentTarget: event.currentTarget,
        } as ReactPointerEvent<HTMLElement>)
      }}
    >
      {editing ? (
        <textarea
          ref={editorRef}
          rows={1}
          aria-label={t('composer.queue.edit')}
          value={editText}
          onChange={(event) => onEditText(event.target.value)}
          onBlur={onBlur}
          onKeyDown={onEditorKeyDown}
        />
      ) : (
        <>
          <button type="button" className="queue-copy" onClick={onEdit}>
            <span>
              {parseMaterializedReferences(message.content).text ||
                t('composer.queue.attachment')}
            </span>
            {message.attachedFiles.length ? (
              <small>
                {t('composer.queue.attached', {
                  count: message.attachedFiles.length,
                })}
              </small>
            ) : null}
          </button>
          <div className="queue-actions">
            <button
              type="button"
              className="queue-steer"
              disabled={disabled || !generating}
              onClick={onSteer}
            >
              {t('composer.queue.steer')}
            </button>
            <button
              type="button"
              className="queue-delete"
              aria-label={t('composer.queue.delete')}
              disabled={disabled}
              onClick={onDelete}
            >
              <Trash2 {...ICON} />
            </button>
          </div>
        </>
      )}
    </article>
  )
}
