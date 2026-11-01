import { FileText, Pencil, Target } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useDesktopThreadEvents } from '../desktops/ThreadActivityProvider'
import { BottomSheet } from '../components/BottomSheet'
import { Snackbar } from '../components/Snackbar'
import { haptic } from '../haptics'
import { currentLocale, useT } from '../i18n'
import type { AlmaApi, ProjectCard } from '../relay'
import {
  RefCardSheet,
  RefChip,
  RefOpenContext,
  type OpenedRef,
} from './RefCardSheet'
import {
  diffProjectCard,
  formatProjectCardRelativeTime,
  normalizeProjectCardResponse,
  projectCardIsHidden,
  projectCardNeedsToggle,
} from './projectCard'

interface ProjectCardSectionProps {
  api: AlmaApi
  desktopId: string
  workspaceId: string
  onNavigate(path: string): void
}

type CardState =
  | { status: 'loading' }
  | { status: 'hidden' }
  | { status: 'ready'; card: ProjectCard }

function ExpandableText({ value }: { value: string }) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const [showToggle, setShowToggle] = useState(false)
  const paragraph = useRef<HTMLParagraphElement>(null)
  useLayoutEffect(() => {
    const node = paragraph.current
    if (!node) return
    const measure = () =>
      setShowToggle(
        projectCardNeedsToggle(expanded, node.scrollHeight, node.clientHeight),
      )
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [expanded, value])
  return value ? (
    <div className="project-card-expandable">
      <p ref={paragraph} className={expanded ? '' : 'clamped'}>
        {value}
      </p>
      {showToggle && (
        <button
          className="quiet-text-button"
          onClick={() => setExpanded((current) => !current)}
        >
          {t(
            expanded
              ? 'threads.projectCard.collapse'
              : 'threads.projectCard.expand',
          )}
        </button>
      )}
    </div>
  ) : (
    <p className="project-card-empty">{t('threads.projectCard.empty')}</p>
  )
}

export function ProjectCardSection({
  api,
  desktopId,
  workspaceId,
  onNavigate,
}: ProjectCardSectionProps) {
  const t = useT()
  const [state, setState] = useState<CardState>({ status: 'loading' })
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ brief: '', focus: '' })
  const [pending, setPending] = useState<'save' | 'accept' | 'reject'>()
  const [notice, setNotice] = useState('')
  const [openedRef, setOpenedRef] = useState<OpenedRef>()

  const load = useCallback(async () => {
    try {
      const card = normalizeProjectCardResponse(
        await api.getProjectCard(workspaceId),
      )
      setState(card ? { status: 'ready', card } : { status: 'hidden' })
    } catch (error) {
      if (projectCardIsHidden(error)) setState({ status: 'hidden' })
      else {
        setState({ status: 'hidden' })
        setNotice(t('threads.projectCard.loadError'))
      }
    }
  }, [api, workspaceId, t])

  useEffect(() => {
    void load()
    const refresh = () => {
      if (document.visibilityState === 'visible') void load()
    }
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [load])
  useDesktopThreadEvents(desktopId, (event) => {
    if (event.type === 'workspace_updated' && event.data?.id === workspaceId)
      void load()
  })

  if (state.status !== 'ready')
    return notice ? (
      <Snackbar message={notice} onDismiss={() => setNotice('')} />
    ) : null

  const { card } = state
  const proposalDiff = card.proposal
    ? diffProjectCard(card, card.proposal)
    : undefined
  const proposalTime = card.proposal
    ? formatProjectCardRelativeTime(
        card.proposal.proposedAt,
        Date.now(),
        currentLocale(),
      )
    : ''

  const save = async () => {
    void haptic('light')
    setPending('save')
    try {
      const result = await api.saveProjectCard(workspaceId, {
        brief: draft.brief.trim(),
        focus: draft.focus.trim(),
        resume: card.resume,
      })
      setState({ status: 'ready', card: result.card })
      setEditing(false)
    } catch {
      setNotice(t('threads.projectCard.saveError'))
    } finally {
      setPending(undefined)
    }
  }

  const resolve = async (accept: boolean) => {
    void haptic('light')
    setPending(accept ? 'accept' : 'reject')
    try {
      const result = await api.resolveProjectCardProposal(workspaceId, accept)
      setState({ status: 'ready', card: result.card })
    } catch {
      setNotice(t('threads.projectCard.resolveError'))
    } finally {
      setPending(undefined)
    }
  }

  return (
    <>
      <button
        className="project-card-summary-row"
        onClick={() => setOpen(true)}
      >
        <FileText size={16} aria-hidden="true" />
        <span>
          <strong>{t('threads.projectCard.title')}</strong>
          <small>
            {card.focus || card.brief || t('threads.projectCard.summary')}
          </small>
        </span>
        {card.proposal ? <i>{t('threads.projectCard.proposed')}</i> : null}
      </button>
      {open ? (
        <BottomSheet
          title={t('threads.projectCard.title')}
          className="project-card-sheet"
          onClose={() => setOpen(false)}
        >
          <div className="project-card-heading">
            <span />
            <button
              className="quiet-text-button"
              onClick={() => {
                setDraft({ brief: card.brief, focus: card.focus })
                setEditing(true)
              }}
            >
              <Pencil size={14} /> {t('threads.projectCard.edit')}
            </button>
          </div>
          <section className="project-card-field">
            <h3>
              <FileText size={15} /> {t('threads.projectCard.brief')}
            </h3>
            <ExpandableText value={card.brief} />
          </section>
          <section className="project-card-field">
            <h3>
              <Target size={15} /> {t('threads.projectCard.focus')}
            </h3>
            <ExpandableText value={card.focus} />
          </section>
          {card.resume.length ? (
            <section className="project-card-field">
              <h3>{t('threads.projectCard.resume')}</h3>
              <RefOpenContext.Provider value={setOpenedRef}>
                <div className="project-card-resume-links">
                  {card.resume.map((link) => (
                    <RefChip key={link.uri} uri={link.uri}>
                      {link.label}
                    </RefChip>
                  ))}
                </div>
              </RefOpenContext.Provider>
            </section>
          ) : null}
          {card.proposal && proposalDiff ? (
            <section className="project-card-proposal">
              <header>
                <strong>{t('threads.projectCard.proposed')}</strong>
                <div>
                  {card.proposal.source ? (
                    <span>
                      {t('threads.projectCard.proposedBy', {
                        source: card.proposal.source,
                      })}
                    </span>
                  ) : null}
                  {proposalTime ? (
                    <time>
                      {t('threads.projectCard.proposedAt', {
                        time: proposalTime,
                      })}
                    </time>
                  ) : null}
                </div>
              </header>
              <p>{card.proposal.reason}</p>
              {proposalDiff.brief ? (
                <TextDiff
                  label={t('threads.projectCard.brief')}
                  before={proposalDiff.brief.before}
                  after={proposalDiff.brief.after}
                />
              ) : null}
              {proposalDiff.focus ? (
                <TextDiff
                  label={t('threads.projectCard.focus')}
                  before={proposalDiff.focus.before}
                  after={proposalDiff.focus.after}
                />
              ) : null}
              {proposalDiff.resume.added.length ||
              proposalDiff.resume.removed.length ? (
                <div className="project-card-diff">
                  <strong>{t('threads.projectCard.resume')}</strong>
                  {proposalDiff.resume.added.map((link) => (
                    <span className="added" key={`add-${link.uri}`}>
                      {t('threads.projectCard.added')}: {link.label}
                    </span>
                  ))}
                  {proposalDiff.resume.removed.map((link) => (
                    <span className="removed" key={`remove-${link.uri}`}>
                      {t('threads.projectCard.removed')}: {link.label}
                    </span>
                  ))}
                </div>
              ) : null}
              <div className="project-card-proposal-actions">
                <button
                  className="quiet-text-button"
                  disabled={Boolean(pending)}
                  onClick={() => void resolve(false)}
                >
                  {pending === 'reject'
                    ? t('threads.projectCard.resolving')
                    : t('threads.projectCard.reject')}
                </button>
                <button
                  className="primary"
                  disabled={Boolean(pending)}
                  onClick={() => void resolve(true)}
                >
                  {pending === 'accept'
                    ? t('threads.projectCard.resolving')
                    : t('threads.projectCard.accept')}
                </button>
              </div>
            </section>
          ) : null}
        </BottomSheet>
      ) : null}
      {editing ? (
        <BottomSheet
          title={t('threads.projectCard.editTitle')}
          className="project-card-edit-sheet"
          onClose={() => setEditing(false)}
          footer={
            <button
              className="primary"
              disabled={pending === 'save'}
              onClick={() => void save()}
            >
              {pending === 'save'
                ? t('threads.projectCard.saving')
                : t('threads.projectCard.save')}
            </button>
          }
        >
          <label>
            {t('threads.projectCard.brief')}
            <textarea
              autoFocus
              value={draft.brief}
              onChange={(event) =>
                setDraft({ ...draft, brief: event.target.value })
              }
            />
          </label>
          <label>
            {t('threads.projectCard.focus')}
            <textarea
              value={draft.focus}
              onChange={(event) =>
                setDraft({ ...draft, focus: event.target.value })
              }
            />
          </label>
        </BottomSheet>
      ) : null}
      {openedRef ? (
        <RefCardSheet
          api={api}
          desktopId={desktopId}
          threadId=""
          opened={openedRef}
          onNavigate={onNavigate}
          onClose={() => setOpenedRef(undefined)}
        />
      ) : null}
      {notice ? (
        <Snackbar message={notice} onDismiss={() => setNotice('')} />
      ) : null}
    </>
  )
}

function TextDiff({
  label,
  before,
  after,
}: {
  label: string
  before: string
  after: string
}) {
  const t = useT()
  return (
    <div className="project-card-diff">
      <strong>{label}</strong>
      <span>
        <small>{t('threads.projectCard.current')}</small>
        {before || t('threads.projectCard.empty')}
      </span>
      <span>
        <small>{t('threads.projectCard.proposedValue')}</small>
        {after || t('threads.projectCard.empty')}
      </span>
    </div>
  )
}
