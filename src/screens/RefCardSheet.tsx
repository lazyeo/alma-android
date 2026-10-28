import { ChevronRight, ExternalLink, MessagesSquare } from 'lucide-react'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { BottomSheet } from '../components/BottomSheet'
import { desktopThreadPath } from '../desktopRoutes'
import { isUnsupportedEndpoint, type AlmaApi, type RefCard } from '../relay'
import { RefKindIcon } from './RefPicker'
import { refDestination, type RefBacklink } from './refCards'
import { LoadingOrb } from './LoadingOrbCanvas'
import { t as runtimeT, useT } from '../i18n'

export interface OpenedRef {
  uri: string
  label: string
}

/**
 * Message parts are memoized deep in the list; a context lets their chips
 * open the thread-owned card sheet without threading props through them.
 */
export const RefOpenContext = createContext<
  ((ref: OpenedRef) => void) | undefined
>(undefined)

const kindOf = (uri: string) =>
  /^alma:\/\/([^/]+)/.exec(uri)?.[1] ?? 'reference'

function plainText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(plainText).join('')
  return ''
}

/** Rendered in place of `@[label](alma://…)` in user and assistant markdown. */
export function RefChip({
  uri,
  children,
}: {
  uri: string
  children: ReactNode
}) {
  const open = useContext(RefOpenContext)
  const label = plainText(children) || uri
  const content = (
    <>
      <RefKindIcon kind={kindOf(uri)} size={13} />
      <span>{label}</span>
    </>
  )
  return open ? (
    <button
      type="button"
      className="ref-chip"
      title={uri}
      onClick={(event) => {
        // The message bubble owns long-press and tap handlers.
        event.stopPropagation()
        open({ uri, label })
      }}
    >
      {content}
    </button>
  ) : (
    <span className="ref-chip" title={uri}>
      {content}
    </span>
  )
}

type CardState =
  | { status: 'loading' }
  | { status: 'unsupported' }
  | { status: 'error'; message: string }
  | { status: 'ready'; card?: RefCard; backlinks: RefBacklink[] }

export function RefCardSheet({
  api,
  desktopId,
  threadId,
  opened,
  onNavigate,
  onClose,
}: {
  api: AlmaApi
  desktopId: string
  threadId: string
  opened: OpenedRef
  onNavigate(path: string): void
  onClose(): void
}) {
  const t = useT()
  const [state, setState] = useState<CardState>({ status: 'loading' })
  useEffect(() => {
    let cancelled = false
    setState({ status: 'loading' })
    Promise.all([
      api.resolveRefs([opened.uri], { full: true, threadId }),
      // Backlinks are auxiliary; an old desktop or a failure leaves the card usable.
      api.getBacklinks(opened.uri).catch(() => []),
    ])
      .then(([resolved, backlinks]) => {
        if (cancelled) return
        setState({
          status: 'ready',
          card: resolved.results.find((item) => item.uri === opened.uri),
          backlinks: backlinks.filter((item) => item.threadId !== threadId),
        })
      })
      .catch((cardError) => {
        if (cancelled) return
        setState(
          isUnsupportedEndpoint(cardError)
            ? { status: 'unsupported' }
            : {
                status: 'error',
                message:
                  cardError instanceof Error
                    ? cardError.message
                    : runtimeT('library.references.loadFailed'),
              },
        )
      })
    return () => {
      cancelled = true
    }
  }, [api, opened.uri, threadId])

  const card = state.status === 'ready' ? state.card : undefined
  const destination =
    card?.exists !== false
      ? refDestination(desktopId, card ?? { uri: opened.uri })
      : undefined
  return (
    <BottomSheet
      title={card?.title || opened.label}
      className="ref-card-sheet"
      onClose={onClose}
      footer={
        destination ? (
          <button className="primary" onClick={() => onNavigate(destination)}>
            <ExternalLink size={16} />
            {t('common.open')}
          </button>
        ) : undefined
      }
    >
      <div className="ref-card-kind">
        <RefKindIcon kind={card?.kind ?? kindOf(opened.uri)} />
        <span>{card?.kind ?? kindOf(opened.uri)}</span>
        {card?.subtitle ? <small>{card.subtitle}</small> : null}
      </div>
      {state.status === 'loading' ? (
        <p className="ref-card-note">
          <LoadingOrb size={14} /> {t('library.references.resolving')}
        </p>
      ) : state.status === 'unsupported' ? (
        <p className="ref-card-note">{t('library.references.unsupported')}</p>
      ) : state.status === 'error' ? (
        <p className="ref-card-note error">{state.message}</p>
      ) : !card || card.exists === false ? (
        <p className="ref-card-note">{t('library.references.gone')}</p>
      ) : card.summary ? (
        <p className="ref-card-summary">{card.summary}</p>
      ) : null}
      {state.status === 'ready' && state.backlinks.length ? (
        <section
          className="ref-backlinks"
          aria-label={t('library.references.mentionedIn')}
        >
          <h3>
            {t('library.references.mentionedInCount', {
              count: state.backlinks.length,
            })}
          </h3>
          <div className="sheet-list">
            {state.backlinks.map((link) => (
              <button
                key={link.threadId}
                className="sheet-row"
                onClick={() =>
                  onNavigate(desktopThreadPath(desktopId, link.threadId))
                }
              >
                <MessagesSquare size={17} />
                <span className="sheet-row-copy">
                  <span>{link.title ?? t('common.untitledThread')}</span>
                  {link.snippet ? <small>{link.snippet}</small> : null}
                </span>
                <ChevronRight size={16} />
              </button>
            ))}
          </div>
        </section>
      ) : null}
    </BottomSheet>
  )
}
