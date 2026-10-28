import { useState } from 'react'
import type { UserQuestion } from '../relay'
import {
  buildQuestionAnswers,
  optionLabel,
  scopedRequestId,
  type DesktopApprovalRequest,
  type DesktopQuestionRequest,
  type QuestionAnswerDrafts,
} from '../screens/inboxModel'
import { useT } from '../i18n'

/** Titles keyed by desktop id, then thread id. */
type ThreadTitles = Record<string, Record<string, string>>
type DraftsByRequest = Record<string, QuestionAnswerDrafts>

function ThreadContext({
  desktopId,
  threadId,
  titles,
  desktopName,
}: {
  desktopId: string
  threadId?: string
  titles?: ThreadTitles
  desktopName?: string
}) {
  const t = useT()
  if (!threadId) return null
  return (
    <p className="request-thread">
      <strong>{titles?.[desktopId]?.[threadId] ?? threadId}</strong>
      {desktopName ? t('handoff.onDesktop', { desktop: desktopName }) : ''}
    </p>
  )
}

function QuestionOptions({
  requestId,
  question,
  questionIndex,
  draft,
  onChange,
}: {
  requestId: string
  question: UserQuestion
  questionIndex: number
  draft: { selected: string[]; custom: string }
  onChange: (draft: { selected: string[]; custom: string }) => void
}) {
  const t = useT()
  return (
    <fieldset className="question-fieldset">
      <legend>
        {question.header ? <span>{question.header}</span> : null}
        <strong>{question.question}</strong>
      </legend>
      <div className="question-options">
        {question.options.map((option, optionIndex) => {
          const label = optionLabel(option)
          const checked = draft.selected.includes(label)
          return (
            <label className="question-option" key={`${label}-${optionIndex}`}>
              <input
                type={question.multiSelect ? 'checkbox' : 'radio'}
                name={`${requestId}-${questionIndex}`}
                value={label}
                checked={checked}
                onChange={(event) => {
                  const selected = question.multiSelect
                    ? event.target.checked
                      ? [...draft.selected, label]
                      : draft.selected.filter((value) => value !== label)
                    : [label]
                  onChange({ ...draft, selected })
                }}
              />
              <span>
                <strong>{label}</strong>
                {option.description ? (
                  <small>{option.description}</small>
                ) : null}
              </span>
            </label>
          )
        })}
      </div>
      {question.allowCustomAnswer !== false ? (
        <label className="custom-answer">
          <span>{t('handoff.customAnswer')}</span>
          <input
            type={question.isSecret ? 'password' : 'text'}
            value={draft.custom}
            onChange={(event) =>
              onChange({ ...draft, custom: event.target.value })
            }
            placeholder={t('handoff.addAnswer')}
          />
        </label>
      ) : null}
    </fieldset>
  )
}

export function HandoffCards({
  approvals,
  questions,
  threadTitles,
  compact = false,
  onRespondApproval,
  onRespondQuestion,
}: {
  approvals: DesktopApprovalRequest[]
  questions: DesktopQuestionRequest[]
  threadTitles?: ThreadTitles
  compact?: boolean
  onRespondApproval: (
    request: DesktopApprovalRequest,
    action: 'allow_once' | 'allow_always' | 'deny' | 'deny_with_reason',
    reason?: string,
  ) => Promise<void>
  onRespondQuestion: (
    request: DesktopQuestionRequest,
    action: 'accept' | 'decline' | 'cancel',
    answers?: Array<{ selected: string[]; custom?: string }>,
  ) => Promise<void>
}) {
  const t = useT()
  const [drafts, setDrafts] = useState<DraftsByRequest>({})
  const [denialReasons, setDenialReasons] = useState<Record<string, string>>({})
  const [questionPages, setQuestionPages] = useState<Record<string, number>>({})

  return (
    <div className={compact ? 'inbox-list inline-handoff-list' : 'inbox-list'}>
      {approvals.map((item) => {
        // Request ids are only unique per desktop.
        const key = scopedRequestId(item.desktopId, item.requestId)
        const reason = denialReasons[key]
        return (
          <article className="inbox-card" key={key}>
            <p className="eyebrow request-eyebrow">
              <span>{t('handoff.toolApproval')}</span>
              <code>{item.source}</code>
            </p>
            <h2>{item.title || t('handoff.toolRequest')}</h2>
            <ThreadContext
              desktopId={item.desktopId}
              threadId={item.threadId}
              titles={threadTitles}
              desktopName={compact ? undefined : item.desktopName}
            />
            <div className="approval-input">
              <span>{t('handoff.request')}</span>
              <pre>{item.message}</pre>
            </div>
            {reason !== undefined ? (
              <div className="deny-form">
                <label htmlFor={`deny-${key}`}>
                  {t('handoff.denialReason')}
                </label>
                <textarea
                  id={`deny-${key}`}
                  value={reason}
                  onChange={(event) =>
                    setDenialReasons((current) => ({
                      ...current,
                      [key]: event.target.value,
                    }))
                  }
                  autoFocus
                />
                <div className="action-grid">
                  <button
                    className="danger"
                    onClick={() =>
                      void onRespondApproval(
                        item,
                        'deny_with_reason',
                        reason.trim() || undefined,
                      )
                    }
                  >
                    {t('handoff.submitDenial')}
                  </button>
                  <button
                    onClick={() =>
                      setDenialReasons((current) => {
                        const next = { ...current }
                        delete next[key]
                        return next
                      })
                    }
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="action-grid">
                <button
                  onClick={() => void onRespondApproval(item, 'allow_once')}
                >
                  {item.confirmLabel || t('handoff.allowOnce')}
                </button>
                <button
                  onClick={() => void onRespondApproval(item, 'allow_always')}
                >
                  {t('handoff.allowAlways')}
                </button>
                <button
                  className="danger"
                  onClick={() => void onRespondApproval(item, 'deny')}
                >
                  {item.cancelLabel || t('handoff.deny')}
                </button>
                <button
                  className="danger"
                  onClick={() =>
                    setDenialReasons((current) => ({
                      ...current,
                      [key]: '',
                    }))
                  }
                >
                  {t('handoff.denyWithReason')}
                </button>
              </div>
            )}
          </article>
        )
      })}
      {questions.map((item) => {
        const key = scopedRequestId(item.desktopId, item.requestId)
        const page = Math.min(
          questionPages[key] ?? 0,
          Math.max(0, item.questions.length - 1),
        )
        const question = item.questions[page]
        const requestDrafts = drafts[key] ?? {}
        return (
          <article className="inbox-card" key={key}>
            <p className="eyebrow request-eyebrow">
              <span>{t('handoff.question')}</span>
              <code>{item.source}</code>
            </p>
            <ThreadContext
              desktopId={item.desktopId}
              threadId={item.threadId}
              titles={threadTitles}
              desktopName={compact ? undefined : item.desktopName}
            />
            {question ? (
              <QuestionOptions
                requestId={key}
                question={question}
                questionIndex={page}
                draft={requestDrafts[page] ?? { selected: [], custom: '' }}
                onChange={(draft) =>
                  setDrafts((current) => ({
                    ...current,
                    [key]: {
                      ...current[key],
                      [page]: draft,
                    },
                  }))
                }
              />
            ) : null}
            {item.questions.length > 1 ? (
              <div className="question-pager">
                <button
                  disabled={page === 0}
                  onClick={() =>
                    setQuestionPages((current) => ({
                      ...current,
                      [key]: page - 1,
                    }))
                  }
                >
                  {t('handoff.previous')}
                </button>
                <span>
                  {t('handoff.page', {
                    page: page + 1,
                    total: item.questions.length,
                  })}
                </span>
                <button
                  disabled={page === item.questions.length - 1}
                  onClick={() =>
                    setQuestionPages((current) => ({
                      ...current,
                      [key]: page + 1,
                    }))
                  }
                >
                  {t('handoff.next')}
                </button>
              </div>
            ) : null}
            <div className="action-grid">
              <button
                onClick={() =>
                  void onRespondQuestion(
                    item,
                    'accept',
                    buildQuestionAnswers(item.questions, requestDrafts),
                  )
                }
              >
                {t('handoff.submitAnswer')}
              </button>
              <button
                className="danger"
                onClick={() => void onRespondQuestion(item, 'decline')}
              >
                {t('handoff.decline')}
              </button>
            </div>
          </article>
        )
      })}
    </div>
  )
}
