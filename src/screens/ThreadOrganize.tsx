import { Check, CircleDot, Pin, PinOff, Star, StarOff } from 'lucide-react'
import {
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import type { AnchoredMenuItem } from '../components/AnchoredMenu'
import { BottomSheet } from '../components/BottomSheet'
import { Snackbar } from '../components/Snackbar'
import { haptic } from '../haptics'
import type { AlmaApi, Thread } from '../relay'
import {
  GTD_ALL_STATUSES,
  GTD_STATUS_ICON,
  gtdStatusLabel,
  gtdStatusOf,
} from './gtdModel'
import {
  applyThreadUpdate,
  favoritePinUpdate,
  favoriteUpdate,
  gtdStatusUpdate,
  rollbackThreadUpdate,
  type ThreadGtdStatus,
  type ThreadOrganizeUpdate,
} from './threadGtd'
import { useT } from '../i18n'

interface Notice {
  key: number
  message: string
  undo?: () => void
}

/**
 * GTD status and favorite writes shared by Threads and GTD: optimistic local
 * update (updatedAt untouched), one `PUT /api/threads/:id`, field-level
 * rollback on failure, and an Undo snackbar for status moves.
 */
export function useThreadOrganize({
  api,
  threads,
  setThreads,
  setError,
}: {
  api: AlmaApi
  threads: Thread[]
  setThreads: Dispatch<SetStateAction<Thread[]>>
  setError(message: string): void
}) {
  const t = useT()
  const latest = useRef(threads)
  latest.current = threads
  const noticeKey = useRef(0)
  const [notice, setNotice] = useState<Notice>()
  const [statusSheet, setStatusSheet] = useState<Thread>()
  // Rows whose to-do is being marked done keep the spinner in their slot.
  const [pendingDoneIds, setPendingDoneIds] = useState<Set<string>>(new Set())

  const current = (thread: Thread) =>
    latest.current.find((row) => row.id === thread.id) ?? thread

  const write = async (
    thread: Thread,
    update: ThreadOrganizeUpdate,
    failure: string,
  ) => {
    const before = current(thread)
    setThreads((rows) =>
      rows.map((row) =>
        row.id === before.id ? applyThreadUpdate(row, update) : row,
      ),
    )
    try {
      await api.updateThread(before.id, update)
      return true
    } catch (cause) {
      setThreads((rows) =>
        rows.map((row) =>
          row.id === before.id
            ? rollbackThreadUpdate(row, before, update)
            : row,
        ),
      )
      setNotice(undefined)
      setError(cause instanceof Error ? cause.message : failure)
      return false
    }
  }

  const setStatus = async (
    thread: Thread,
    status: ThreadGtdStatus,
    { undoable = true }: { undoable?: boolean } = {},
  ) => {
    const before = current(thread)
    const previous = gtdStatusOf(before)
    if (previous === status) return
    const markingDone =
      status === 'done' && (previous === 'todo' || previous === 'in_progress')
    if (markingDone) setPendingDoneIds((ids) => new Set(ids).add(before.id))
    if (undoable)
      setNotice({
        key: ++noticeKey.current,
        message: t('threads.organize.movedTo', {
          status: gtdStatusLabel(status),
        }),
        undo: () => {
          setNotice(undefined)
          void setStatus(before, previous, { undoable: false })
        },
      })
    await write(
      before,
      gtdStatusUpdate(before, status),
      t('threads.errors.status'),
    )
    if (markingDone)
      setPendingDoneIds((ids) => {
        const next = new Set(ids)
        next.delete(before.id)
        return next
      })
  }

  const toggleFavorite = (thread: Thread) => {
    const before = current(thread)
    void haptic('light')
    void write(
      before,
      favoriteUpdate(before, !before.isFavorited),
      t('threads.errors.favorite'),
    )
  }

  const togglePin = (thread: Thread) => {
    const before = current(thread)
    if (!before.isFavorited) return
    void haptic('light')
    void write(
      before,
      favoritePinUpdate(before, latest.current, !before.isFavoritePinned),
      t('threads.errors.pin'),
    )
  }

  const menuItems = (thread: Thread): AnchoredMenuItem[] => [
    {
      key: 'status',
      label: t('threads.organize.setStatus'),
      detail: gtdStatusLabel(gtdStatusOf(thread)),
      icon: <CircleDot size={16} />,
      onSelect: () => setStatusSheet(thread),
    },
    {
      key: 'favorite',
      label: thread.isFavorited
        ? t('threads.organize.unfavorite')
        : t('threads.organize.favorite'),
      icon: thread.isFavorited ? <StarOff size={16} /> : <Star size={16} />,
      onSelect: () => toggleFavorite(thread),
    },
    ...(thread.isFavorited
      ? [
          {
            key: 'pin',
            label: thread.isFavoritePinned
              ? t('threads.organize.unpin')
              : t('threads.organize.pin'),
            icon: thread.isFavoritePinned ? (
              <PinOff size={16} />
            ) : (
              <Pin size={16} />
            ),
            onSelect: () => togglePin(thread),
          },
        ]
      : []),
  ]

  const sheetThread = statusSheet && current(statusSheet)
  const overlays: ReactNode = (
    <>
      {sheetThread ? (
        <BottomSheet
          title={t('threads.organize.setStatus')}
          label={t('threads.organize.setStatusFor', {
            title: sheetThread.title || t('common.untitledThread'),
          })}
          onClose={() => setStatusSheet(undefined)}
        >
          <div className="sheet-list">
            {GTD_ALL_STATUSES.map((status) => {
              const selected = gtdStatusOf(sheetThread) === status
              const StatusIcon = GTD_STATUS_ICON[status]
              return (
                <button
                  className={`sheet-row${selected ? ' selected' : ''}`}
                  key={status}
                  aria-pressed={selected}
                  onClick={() => {
                    void haptic('selection')
                    setStatusSheet(undefined)
                    void setStatus(sheetThread, status)
                  }}
                >
                  <StatusIcon size={16} aria-hidden="true" />
                  <span className="sheet-row-copy">
                    <span>{gtdStatusLabel(status)}</span>
                  </span>
                  {selected ? (
                    <Check
                      className="sheet-row-check"
                      size={18}
                      strokeWidth={2}
                    />
                  ) : null}
                </button>
              )
            })}
          </div>
        </BottomSheet>
      ) : null}
      {notice ? (
        <Snackbar
          key={notice.key}
          message={notice.message}
          actionLabel={notice.undo ? t('common.undo') : undefined}
          onAction={notice.undo}
          onDismiss={() =>
            setNotice((shown) =>
              shown?.key === notice.key ? undefined : shown,
            )
          }
        />
      ) : null}
    </>
  )

  return {
    setStatus,
    toggleFavorite,
    togglePin,
    menuItems,
    pendingDoneIds,
    overlays,
  }
}
