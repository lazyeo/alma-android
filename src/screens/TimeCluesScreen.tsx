import {
  AlarmClock,
  EllipsisVertical,
  MessageSquare,
  Trash2,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnchoredMenu, pointAnchor } from '../components/AnchoredMenu'
import { useLongPress } from '../components/useLongPress'
import { useConnection } from '../desktops/DesktopContext'
import { ScopedRootHeader } from '../layout/ScopedRootHeader'
import { desktopThreadPath } from '../desktopRoutes'
import { haptic } from '../haptics'
import { isUnsupportedEndpoint } from '../relay'
import { t as runtimeT, useT } from '../i18n'
import {
  formatTimeClueHeading,
  groupTimeClues,
  naturalTimeClueRange,
  timeClueAnchor,
  timeClueCoversDay,
  timeClueRangeId,
  timeClueHasActions,
  timeClueTitle,
  type TimeClueEntry,
  type TimeClueRangeName,
  type TimeClueResponse,
} from './timeClues'

// Range ids are wire values; catalog keys are camelCase.
const TAB_COPY = {
  today: 'today',
  'this-week': 'thisWeek',
  'next-week': 'nextWeek',
} as const satisfies Record<TimeClueRangeName, string>
const TABS: TimeClueRangeName[] = ['today', 'this-week', 'next-week']

type MenuState = { entry: TimeClueEntry; x: number; y: number }

function TimeClueRow({
  entry,
  onOpen,
  onMenu,
}: {
  entry: TimeClueEntry
  onOpen(): void
  onMenu(point: { x: number; y: number }): void
}) {
  const t = useT()
  const longPress = useLongPress(onMenu)
  const scheduled = entry.kind === 'scheduled'
  return (
    <article
      className="time-clue-row"
      {...(timeClueHasActions(entry) ? longPress : {})}
    >
      <button className="time-clue-open" onClick={onOpen}>
        <span className="time-clue-kind" aria-hidden="true">
          {scheduled ? <AlarmClock size={16} /> : <MessageSquare size={16} />}
        </span>
        <span className="time-clue-copy">
          <strong>{scheduled ? entry.name : timeClueTitle(entry)}</strong>
          <small>
            {scheduled
              ? t('library.timeClues.scheduledTask')
              : entry.threadTitle}
          </small>
        </span>
        {entry.time ? <time>{entry.time}</time> : null}
      </button>
      {timeClueHasActions(entry) ? (
        <button
          className="time-clue-more"
          aria-label={t('library.timeClues.actionsFor', {
            title: timeClueTitle(entry),
          })}
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect()
            onMenu({ x: box.right, y: box.bottom })
          }}
        >
          <EllipsisVertical size={16} />
        </button>
      ) : null}
    </article>
  )
}

export function TimeCluesScreen() {
  const t = useT()
  const navigate = useNavigate()
  const { api, pairing } = useConnection()
  const [tab, setTab] = useState<TimeClueRangeName>('today')
  const [response, setResponse] = useState<TimeClueResponse>()
  const [unsupported, setUnsupported] = useState(false)
  const [error, setError] = useState('')
  const [menu, setMenu] = useState<MenuState>()
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const todayRange = naturalTimeClueRange('today', new Date(), timeZone)
  const range = naturalTimeClueRange(tab, new Date(), timeZone)
  const rangeId = timeClueRangeId(range)

  const load = useCallback(async () => {
    setError('')
    try {
      const next = await api.getTimeClues(rangeId)
      setResponse(next)
      setUnsupported(false)
      if (tab === 'today') {
        const ids = next.clues
          .filter(
            (clue) =>
              !clue.seen && timeClueCoversDay(clue, todayRange.startDate),
          )
          .map((clue) => clue.id)
        if (ids.length) {
          await api.markTimeCluesSeen(timeClueRangeId(todayRange), ids)
          setResponse(
            (current) =>
              current && {
                ...current,
                unread: 0,
                clues: current.clues.map((clue) =>
                  ids.includes(clue.id) ? { ...clue, seen: true } : clue,
                ),
              },
          )
          window.dispatchEvent(
            new CustomEvent('alma-time-clues-seen', {
              detail: { desktopId: pairing.id },
            }),
          )
        }
      }
    } catch (loadError) {
      if (isUnsupportedEndpoint(loadError)) setUnsupported(true)
      else
        setError(
          loadError instanceof Error
            ? loadError.message
            : runtimeT('library.timeClues.loadFailed'),
        )
    }
  }, [api, pairing.id, rangeId, tab, todayRange.startDate, timeZone])

  useEffect(() => {
    setResponse(undefined)
    void load()
  }, [load])

  const groups = useMemo(
    () =>
      groupTimeClues(
        [...(response?.clues ?? []), ...(response?.scheduled ?? [])],
        todayRange.startDate,
      ),
    [response, todayRange.startDate],
  )

  const open = (entry: TimeClueEntry) => {
    void haptic('light')
    const anchor = timeClueAnchor(entry)
    if (!anchor) return
    navigate(desktopThreadPath(pairing.id, anchor.threadId), {
      state: anchor.anchorId
        ? { fromSearch: true, searchRowId: anchor.anchorId }
        : undefined,
    })
  }

  const ignore = async (entry: TimeClueEntry) => {
    if (entry.kind !== 'clue') return
    setMenu(undefined)
    setResponse(
      (current) =>
        current && {
          ...current,
          clues: current.clues.filter((clue) => clue.id !== entry.id),
        },
    )
    try {
      await api.ignoreTimeClue(entry.id)
      window.dispatchEvent(
        new CustomEvent('alma-time-clues-changed', {
          detail: { desktopId: pairing.id },
        }),
      )
    } catch {
      void load()
    }
  }

  return (
    <section className="root-page time-clues-page">
      <ScopedRootHeader title={t('nav.timeClues')} childOnPhone />
      <div className="thread-tabs time-clue-tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item}
            role="tab"
            aria-selected={tab === item}
            onClick={() => {
              setTab(item)
              void haptic('selection')
            }}
          >
            {t(`library.timeClues.tabs.${TAB_COPY[item]}`)}
          </button>
        ))}
      </div>
      <div className="page-body time-clues-body">
        {unsupported ? (
          <p className="empty">{t('library.timeClues.unavailable')}</p>
        ) : error ? (
          <button className="time-clue-error" onClick={() => void load()}>
            {t('common.tryAgain')}
          </button>
        ) : !response ? (
          <p className="empty">{t('common.loading')}</p>
        ) : groups.length ? (
          groups.map((group) => (
            <section
              className="settings-section time-clue-day"
              key={group.date ?? 'unresolved'}
            >
              <h2 className="settings-section-title">
                {formatTimeClueHeading(group.date, todayRange.startDate)}
              </h2>
              <div className="settings-group time-clue-group">
                {group.entries.map((entry) => (
                  <TimeClueRow
                    key={entry.id}
                    entry={entry}
                    onOpen={() => open(entry)}
                    onMenu={(point) => setMenu({ entry, ...point })}
                  />
                ))}
              </div>
            </section>
          ))
        ) : (
          <p className="empty">
            {t(`library.timeClues.empty.${TAB_COPY[tab]}`, {
              desktop: pairing.name,
            })}
          </p>
        )}
      </div>
      <AnchoredMenu
        open={Boolean(menu)}
        onOpenChange={(open) => {
          if (!open) setMenu(undefined)
        }}
        anchorRect={menu ? pointAnchor(menu.x, menu.y) : undefined}
        label={t('library.timeClues.actions')}
        items={
          menu && timeClueHasActions(menu.entry)
            ? [
                {
                  key: 'ignore',
                  label: t('library.timeClues.ignore'),
                  icon: <Trash2 size={16} />,
                  destructive: true,
                  onSelect: () => void ignore(menu.entry),
                },
              ]
            : []
        }
      />
    </section>
  )
}
