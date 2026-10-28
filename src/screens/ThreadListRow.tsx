import { ListPlus, LoaderCircle, Pencil, Pin, Star } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { useThreadListAccessory } from '../extensions'
import { useLongPress } from '../components/useLongPress'
import {
  useGeneratingIds,
  useUnreadActivity,
} from '../desktops/ThreadActivityProvider'
import { useHandoff } from '../handoff/HandoffProvider'
import type { Thread, Workspace } from '../relay'
import { listDrafts, type ThreadDraft } from './threadDrafts'
import { gtdStatusOf, GTD_STATUS_ICON, gtdStatusLabel } from './gtdModel'
import { listQueuedThreads } from './threadQueue'
import {
  primaryThreadMark,
  threadRowStatuses,
  type PrimaryThreadMark,
  type ThreadRowStatus,
  type ThreadRowStatusKind,
} from './threadStatus'
import { workspaceName } from './workspaceOptions'
import { currentLocale } from '../i18n/runtime'
import { useLanguage, useT } from '../i18n'

export const relative = (value: unknown) => {
  const time = typeof value === 'number' ? value : Date.parse(String(value))
  if (!Number.isFinite(time)) return ''
  const seconds = Math.round((time - Date.now()) / 1000)
  const unit =
    Math.abs(seconds) < 60
      ? 'second'
      : Math.abs(seconds) < 3600
        ? 'minute'
        : Math.abs(seconds) < 86400
          ? 'hour'
          : 'day'
  const divisor =
    unit === 'second'
      ? 1
      : unit === 'minute'
        ? 60
        : unit === 'hour'
          ? 3600
          : 86400
  const locale = currentLocale()
  // Chinese long style reads "8秒钟前"; short is the natural "8秒前".
  return new Intl.RelativeTimeFormat(locale, {
    numeric: 'auto',
    style: locale.startsWith('zh') ? 'short' : 'long',
  }).format(Math.round(seconds / divisor), unit)
}

export function ThreadSpinner({ label }: { label?: string }) {
  const t = useT()
  const gaps = [0, 7, 1, 6, 2, 5, 3, 4]
  return (
    <span
      className="thread-spinner"
      role="img"
      aria-label={label ?? t('thread.generating')}
    >
      {gaps.map((gap, index) => (
        <i key={index} style={{ animationDelay: `${gap * 80}ms` }} />
      ))}
    </span>
  )
}

const STATUS_ICON: Record<ThreadRowStatusKind, ReactNode> = {
  generating: <LoaderCircle className="spinner" size={12} strokeWidth={2} />,
  naming: <LoaderCircle className="spinner" size={12} strokeWidth={2} />,
  queued: <ListPlus size={12} strokeWidth={2} />,
  draft: <Pencil size={12} strokeWidth={2} />,
}

export interface ThreadRowIndicators {
  primaryMark?: PrimaryThreadMark
  statuses: ThreadRowStatus[]
  pendingTodoDone: boolean
}

/**
 * Per-row live state shared by every thread list: generation, pending
 * responses, local drafts and queues, unread replies.
 */
export function useThreadRowIndicators(desktopId: string) {
  const extensionCount = useThreadListAccessory(desktopId)
  const { approvals, questions } = useHandoff()
  const { language } = useLanguage()
  const generating = useGeneratingIds(desktopId)
  const { unread } = useUnreadActivity()
  const pendingThreadIds = useMemo(
    () =>
      new Set(
        [...approvals, ...questions]
          .filter(
            (request) => request.desktopId === desktopId && request.threadId,
          )
          .map((request) => request.threadId!),
      ),
    [approvals, desktopId, questions],
  )
  const [drafts, setDrafts] = useState<Map<string, ThreadDraft>>(new Map())
  const [queueCounts, setQueueCounts] = useState<Map<string, number>>(new Map())
  // Read in an effect (not a state initializer) so the thread screen's
  // unmount flush has already landed when returning to this list.
  useEffect(() => {
    const refreshDrafts = () => {
      setDrafts(
        new Map(
          listDrafts(window.localStorage, desktopId).map((draft) => [
            draft.threadId,
            draft,
          ]),
        ),
      )
      setQueueCounts(
        new Map(
          listQueuedThreads(window.localStorage, desktopId).map((queue) => [
            queue.threadId,
            queue.count,
          ]),
        ),
      )
    }
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshDrafts()
    }
    refreshDrafts()
    document.addEventListener('visibilitychange', refreshWhenVisible)
    window.addEventListener('pageshow', refreshDrafts)
    return () => {
      document.removeEventListener('visibilitychange', refreshWhenVisible)
      window.removeEventListener('pageshow', refreshDrafts)
    }
  }, [desktopId])
  const indicatorsFor = useCallback(
    (thread: Thread, pendingTodoDone = false): ThreadRowIndicators => {
      const isGenerating =
        generating.has(thread.id) || Boolean(thread.isGenerating)
      const statuses = threadRowStatuses({
        generating: isGenerating,
        namingTitle: Boolean(thread.isGeneratingTitle),
        queuedCount:
          extensionCount(thread.id) ?? queueCounts.get(thread.id) ?? 0,
        hasDraft: drafts.has(thread.id),
      })
      return {
        statuses,
        pendingTodoDone,
        primaryMark: primaryThreadMark({
          generating: isGenerating,
          needsResponse: pendingThreadIds.has(thread.id),
          gtdStatus: gtdStatusOf(thread),
          pendingTodoDone,
          unread: Boolean(unread[desktopId]?.[thread.id]?.unread),
        }),
      }
    },
    // Status labels are translated, so a language switch rebuilds them.
    [
      extensionCount,
      desktopId,
      drafts,
      generating,
      language,
      pendingThreadIds,
      queueCounts,
      unread,
    ],
  )
  return { generating, pendingThreadIds, indicatorsFor }
}

/** Two-line row body: title with one status slot, then project and badges. */
export function ThreadRowContent({
  thread,
  workspaces,
  indicators,
  badges,
  detail,
}: {
  thread: Thread
  workspaces: Workspace[]
  indicators: ThreadRowIndicators
  /** Extra quiet glyphs before the live status badges. */
  badges?: ReactNode
  /** Optional third line, e.g. the to-do Desktop extracted. */
  detail?: string
}) {
  const t = useT()
  const { primaryMark, statuses, pendingTodoDone } = indicators
  const gtdStatus =
    primaryMark === 'todo' || primaryMark === 'in_progress'
      ? primaryMark
      : undefined
  const GtdStatusIcon = gtdStatus ? GTD_STATUS_ICON[gtdStatus] : undefined
  return (
    <div className="thread-copy">
      <div className="thread-title-row">
        <h2>{thread.title || t('common.untitledThread')}</h2>
        <span className="thread-time-status">
          {primaryMark === 'generating' ? (
            <ThreadSpinner />
          ) : (
            <time>{relative(thread.updatedAt ?? thread.createdAt)}</time>
          )}
          {primaryMark === 'response' ? (
            <span
              className="response-dot"
              aria-label={t('threads.row.needsResponse')}
            />
          ) : gtdStatus && GtdStatusIcon ? (
            pendingTodoDone ? (
              <ThreadSpinner label={t('threads.row.markingDone')} />
            ) : (
              <GtdStatusIcon
                className="thread-gtd-mark"
                size={12}
                aria-label={gtdStatusLabel(gtdStatus)}
              />
            )
          ) : primaryMark === 'unread' ? (
            <span className="unread-dot" aria-label={t('threads.row.unread')} />
          ) : null}
        </span>
      </div>
      <p className="thread-secondary">
        <span className="thread-project">
          {workspaceName(thread.workspaceId, workspaces)}
        </span>
        {thread.isFavorited ? (
          thread.isFavoritePinned ? (
            <Pin
              className="thread-favorite-pin"
              size={12}
              aria-label={t('threads.row.pinnedFavorite')}
            />
          ) : (
            <Star
              className="thread-favorite-star"
              size={12}
              fill="currentColor"
              aria-label={t('threads.row.favorite')}
            />
          )
        ) : null}
        {badges}
        {statuses
          .filter((status) => status.kind !== 'generating')
          .map((status) => (
            <span
              className={`thread-status ${status.kind}`}
              key={status.kind}
              title={status.label}
              aria-label={status.label}
            >
              {STATUS_ICON[status.kind]}
            </span>
          ))}
      </p>
      {detail ? (
        <p className="thread-secondary thread-todo-what">{detail}</p>
      ) : null}
    </div>
  )
}

export function ThreadRow({
  onActions,
  onClick,
  children,
  ...props
}: {
  onActions(point: { x: number; y: number }): void
  onClick(): void
  children: ReactNode
  className: string
  style?: CSSProperties
  'aria-current'?: 'page'
}) {
  const t = useT()
  const press = useLongPress(onActions)
  return (
    <article
      {...props}
      {...press}
      tabIndex={0}
      aria-label={t('threads.row.open')}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onClick()
        } else if (
          event.key === 'ContextMenu' ||
          (event.shiftKey && event.key === 'F10')
        ) {
          event.preventDefault()
          const rect = event.currentTarget.getBoundingClientRect()
          onActions({ x: rect.right - 16, y: rect.top + rect.height / 2 })
        }
      }}
    >
      {children}
    </article>
  )
}
