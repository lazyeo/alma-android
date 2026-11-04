import {
  ChevronRight,
  Clock,
  FileText,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Target,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AnchoredMenu } from '../components/AnchoredMenu'
import { BottomSheet } from '../components/BottomSheet'
import { Snackbar } from '../components/Snackbar'
import { useDesktopThreadEvents } from '../desktops/ThreadActivityProvider'
import { haptic } from '../haptics'
import { currentLocale, useT } from '../i18n'
import type {
  AlmaApi,
  ProjectCard,
  ProjectCardConsultTranscript,
  Thread,
} from '../relay'
import { MarkdownContent } from './MarkdownContent'
import { CompactProjectThread } from './ThreadListRow'
import { selectProjectRecentThreads } from './projectRecent'
import {
  RefCardSheet,
  RefChip,
  RefOpenContext,
  type OpenedRef,
} from './RefCardSheet'
import {
  diffProjectCard,
  extractProjectCardError,
  formatProjectCardRelativeTime,
  normalizeProjectCardConsult,
  normalizeProjectCardResponse,
  projectCardHeaderSummary,
  projectCardIsHidden,
  projectCardNeedsToggle,
  projectCardStatus,
} from './projectCard'

interface ProjectCardSectionProps {
  api: AlmaApi
  desktopId: string
  workspaceId: string
  onNewThread?(): void
  onNavigate(path: string): void
  /** This project's threads, already on the client from the thread list. */
  threads?: readonly Thread[]
  selectedThreadId?: string
  threadNeedsResponse?(thread: Thread): boolean
  onOpenThread?(thread: Thread): void
  /** Row actions for a recent thread; the sheet closes before they open. */
  onThreadActions?(thread: Thread, point: { x: number; y: number }): void
  /** Reveals the project's full thread list after the sheet closes. */
  onShowAllThreads?(): void
}

type CardState =
  | { status: 'loading' }
  | { status: 'unsupported' }
  | { status: 'ready'; card: ProjectCard | null }

type Pending = 'save' | 'accept' | 'reject' | 'draft' | 'consultDraft'

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
      {showToggle ? (
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
      ) : null}
    </div>
  ) : (
    <p className="project-card-empty">{t('threads.projectCard.empty')}</p>
  )
}

export function ProjectCardSection({
  api,
  desktopId,
  workspaceId,
  onNewThread = () => undefined,
  onNavigate,
  threads = [],
  selectedThreadId,
  threadNeedsResponse,
  onOpenThread,
  onThreadActions,
  onShowAllThreads,
}: ProjectCardSectionProps) {
  const t = useT()
  const [state, setState] = useState<CardState>({ status: 'loading' })
  const [cardOpen, setCardOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftOpen, setDraftOpen] = useState(false)
  const [draftHint, setDraftHint] = useState('')
  const [consultOpen, setConsultOpen] = useState(false)
  const [consultLoading, setConsultLoading] = useState(false)
  const [consultSending, setConsultSending] = useState(false)
  const [consultQuestion, setConsultQuestion] = useState('')
  const [consult, setConsult] = useState<ProjectCardConsultTranscript>({
    version: 1,
    messages: [],
  })
  const [clearMenuOpen, setClearMenuOpen] = useState(false)
  const [editValue, setEditValue] = useState({ brief: '', focus: '' })
  const [pending, setPending] = useState<Pending>()
  const [notice, setNotice] = useState('')
  const [openedRef, setOpenedRef] = useState<OpenedRef>()
  // Recomputed from the live list every time the sheet opens.
  const recentThreads = useMemo(
    () =>
      cardOpen ? selectProjectRecentThreads(threads) : { recent: [], total: 0 },
    [cardOpen, threads],
  )

  const load = useCallback(async () => {
    try {
      setState({
        status: 'ready',
        card: normalizeProjectCardResponse(
          await api.getProjectCard(workspaceId),
        ),
      })
    } catch (error) {
      if (projectCardIsHidden(error)) setState({ status: 'unsupported' })
      else {
        setState({ status: 'unsupported' })
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

  const showError = (error: unknown, fallback: string) =>
    setNotice(extractProjectCardError(error, fallback))

  const runDraft = async (fromConsult = false) => {
    void haptic('light')
    setPending(fromConsult ? 'consultDraft' : 'draft')
    try {
      const result = await api.draftProjectCard(workspaceId, {
        ...(fromConsult
          ? { fromConsult: true }
          : draftHint.trim()
            ? { hint: draftHint.trim() }
            : {}),
      })
      setState({ status: 'ready', card: result.card })
      setDraftOpen(false)
      setConsultOpen(false)
      setCardOpen(true)
      void haptic('selection')
    } catch (error) {
      showError(error, t('threads.projectCard.draftError'))
    } finally {
      setPending(undefined)
    }
  }

  const openConsult = async () => {
    void haptic('light')
    setConsultOpen(true)
    setConsultLoading(true)
    try {
      setConsult(
        normalizeProjectCardConsult(
          await api.getProjectCardConsult(workspaceId),
        ),
      )
    } catch (error) {
      showError(error, t('threads.projectCard.consult.loadError'))
    } finally {
      setConsultLoading(false)
    }
  }

  const sendConsult = async () => {
    const question = consultQuestion.trim()
    if (!question || consultSending) return
    void haptic('light')
    setConsultSending(true)
    setConsultQuestion('')
    setConsult((current) => ({
      ...current,
      messages: [
        ...current.messages,
        {
          id: `pending-${Date.now()}`,
          role: 'user',
          content: question,
          at: new Date().toISOString(),
        },
      ],
    }))
    try {
      setConsult(
        normalizeProjectCardConsult(
          await api.askProjectCardConsult(workspaceId, question),
        ),
      )
      void haptic('selection')
    } catch (error) {
      setConsultQuestion(question)
      showError(error, t('threads.projectCard.consult.sendError'))
      const loaded = await api
        .getProjectCardConsult(workspaceId)
        .catch(() => undefined)
      if (loaded) setConsult(normalizeProjectCardConsult(loaded))
    } finally {
      setConsultSending(false)
    }
  }

  const clearConsult = async () => {
    try {
      setConsult(
        normalizeProjectCardConsult(
          await api.clearProjectCardConsult(workspaceId),
        ),
      )
      void haptic('selection')
    } catch (error) {
      showError(error, t('threads.projectCard.consult.clearError'))
    }
  }

  if (state.status === 'loading') return null
  if (state.status === 'unsupported')
    return (
      <>
        <button className="project-new-action" onClick={onNewThread}>
          <Plus size={14} />
          {t('threads.newInProject')}
        </button>
        {notice ? (
          <Snackbar message={notice} onDismiss={() => setNotice('')} />
        ) : null}
      </>
    )

  const { card } = state
  const header = projectCardHeaderSummary(card, t('threads.projectCard.noCard'))
  const proposalDiff = card?.proposal
    ? diffProjectCard(card, card.proposal)
    : undefined
  const proposalTime = card?.proposal
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
        brief: editValue.brief.trim(),
        focus: editValue.focus.trim(),
        resume: card?.resume ?? [],
      })
      setState({ status: 'ready', card: result.card })
      setEditing(false)
      void haptic('selection')
    } catch (error) {
      showError(error, t('threads.projectCard.saveError'))
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
      void haptic('selection')
    } catch (error) {
      showError(error, t('threads.projectCard.resolveError'))
    } finally {
      setPending(undefined)
    }
  }

  return (
    <>
      <div className="project-header">
        <button
          className="project-card-summary-row"
          onClick={() => setCardOpen(true)}
        >
          <FileText size={16} aria-hidden="true" />
          <span>
            <strong>{header.primary}</strong>
            {header.secondary ? <small>{header.secondary}</small> : null}
          </span>
          {projectCardStatus(card) === 'proposal' ? (
            <i>{t('threads.projectCard.proposed')}</i>
          ) : null}
        </button>
        <div className="project-header-actions">
          <button className="project-new-action" onClick={onNewThread}>
            <Plus size={16} />
            {t('threads.projectCard.newThread')}
          </button>
          <button onClick={() => setDraftOpen(true)}>
            <Sparkles size={16} />
            {t('threads.projectCard.draft.action')}
          </button>
          <button onClick={() => void openConsult()}>
            <MessageCircle size={16} />
            {t('threads.projectCard.consult.action')}
          </button>
        </div>
      </div>

      {cardOpen ? (
        <BottomSheet
          title={t('threads.projectCard.title')}
          className="project-card-sheet"
          onClose={() => setCardOpen(false)}
        >
          <div className="project-card-heading">
            <span />
            <button
              className="quiet-text-button"
              onClick={() => {
                setEditValue({
                  brief: card?.brief ?? '',
                  focus: card?.focus ?? '',
                })
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
            <ExpandableText value={card?.brief ?? ''} />
          </section>
          <section className="project-card-field">
            <h3>
              <Target size={15} /> {t('threads.projectCard.focus')}
            </h3>
            <ExpandableText value={card?.focus ?? ''} />
          </section>
          {card?.resume.length ? (
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
          {card?.proposal && proposalDiff ? (
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
          {onOpenThread && recentThreads.recent.length ? (
            <section className="project-card-field project-card-recent">
              <h3>
                <Clock size={15} /> {t('threads.projectCard.recent.title')}
              </h3>
              <div className="project-card-recent-list">
                {recentThreads.recent.map((thread) => (
                  <CompactProjectThread
                    key={thread.id}
                    thread={thread}
                    selected={thread.id === selectedThreadId}
                    needsResponse={threadNeedsResponse?.(thread) ?? false}
                    onOpen={() => {
                      setCardOpen(false)
                      onOpenThread(thread)
                    }}
                    onActions={
                      onThreadActions
                        ? (point) => {
                            setCardOpen(false)
                            onThreadActions(thread, point)
                          }
                        : undefined
                    }
                  />
                ))}
              </div>
              {onShowAllThreads &&
              recentThreads.total > recentThreads.recent.length ? (
                <button
                  className="quiet-text-button project-card-recent-all"
                  onClick={() => {
                    setCardOpen(false)
                    onShowAllThreads()
                  }}
                >
                  {t('threads.projectCard.recent.showAll', {
                    count: recentThreads.total,
                  })}
                  <ChevronRight size={14} aria-hidden="true" />
                </button>
              ) : null}
            </section>
          ) : null}
        </BottomSheet>
      ) : null}

      {draftOpen ? (
        <BottomSheet
          title={t('threads.projectCard.draft.title')}
          className="project-card-draft-sheet"
          onClose={() => setDraftOpen(false)}
          footer={
            <button
              className="primary"
              disabled={pending === 'draft'}
              onClick={() => void runDraft()}
            >
              {pending === 'draft' ? (
                <span className="project-card-busy">
                  <span className="spinner" aria-hidden="true" />
                  {t('threads.projectCard.draft.drafting')}
                </span>
              ) : (
                t('threads.projectCard.draft.submit')
              )}
            </button>
          }
        >
          <label>
            {t('threads.projectCard.draft.hint')}
            <textarea
              autoFocus
              rows={2}
              maxLength={500}
              value={draftHint}
              placeholder={t('threads.projectCard.draft.placeholder')}
              onChange={(event) => setDraftHint(event.target.value)}
            />
          </label>
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
              value={editValue.brief}
              onChange={(event) =>
                setEditValue({ ...editValue, brief: event.target.value })
              }
            />
          </label>
          <label>
            {t('threads.projectCard.focus')}
            <textarea
              value={editValue.focus}
              onChange={(event) =>
                setEditValue({ ...editValue, focus: event.target.value })
              }
            />
          </label>
        </BottomSheet>
      ) : null}

      {consultOpen ? (
        <BottomSheet
          title={t('threads.projectCard.consult.title')}
          className="project-consult-sheet"
          onClose={() => setConsultOpen(false)}
          footer={
            <div className="composer project-consult-composer">
              <div className="composer-input">
                <textarea
                  rows={1}
                  disabled={consultSending}
                  value={consultQuestion}
                  placeholder={t('threads.projectCard.consult.placeholder')}
                  onChange={(event) => setConsultQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.nativeEvent.isComposing
                    ) {
                      event.preventDefault()
                      void sendConsult()
                    }
                  }}
                />
              </div>
              <button
                className="send"
                disabled={!consultQuestion.trim() || consultSending}
                aria-label={t('threads.projectCard.consult.send')}
                onClick={() => void sendConsult()}
              >
                {consultSending ? (
                  <span className="spinner" aria-hidden="true" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
          }
        >
          <div className="project-consult-actions">
            <button
              className="quiet-text-button"
              disabled={pending === 'consultDraft'}
              onClick={() => void runDraft(true)}
            >
              <Sparkles size={14} />
              {pending === 'consultDraft'
                ? t('threads.projectCard.draft.drafting')
                : t('threads.projectCard.consult.draftFromThis')}
            </button>
            <AnchoredMenu
              open={clearMenuOpen}
              onOpenChange={setClearMenuOpen}
              label={t('threads.projectCard.consult.clearMenu')}
              trigger={
                <button className="quiet-text-button">
                  <MoreHorizontal size={14} />
                  {t('threads.projectCard.consult.clear')}
                </button>
              }
              items={[
                {
                  key: 'clear',
                  label: t('threads.projectCard.consult.confirmClear'),
                  destructive: true,
                  onSelect: () => void clearConsult(),
                },
              ]}
            />
          </div>
          <p className="project-consult-note">
            {t('threads.projectCard.consult.temporary')}
          </p>
          <div className="project-consult-messages" aria-live="polite">
            {consultLoading ? (
              <p className="project-consult-loading">
                {t('threads.projectCard.consult.loading')}
              </p>
            ) : null}
            {consult.summary ? (
              <div className="project-consult-summary">
                <span>{t('threads.projectCard.consult.summarized')}</span>
              </div>
            ) : null}
            {consult.messages.map((message) =>
              message.role === 'user' ? (
                <div className="message user" key={message.id}>
                  {message.content}
                </div>
              ) : (
                <div className="message assistant" key={message.id}>
                  <MarkdownContent text={message.content} />
                </div>
              ),
            )}
            {!consultLoading && !consult.messages.length ? (
              <p className="project-consult-empty">
                {t('threads.projectCard.consult.empty')}
              </p>
            ) : null}
          </div>
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
