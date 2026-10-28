import {
  isUnsupportedEndpoint,
  type ApprovalRequest,
  type QuestionRequest,
  type UserQuestion,
} from '../relay'
import { t } from '../i18n/runtime'

export type DesktopApprovalRequest = ApprovalRequest & {
  desktopId: string
  desktopName: string
}
export type DesktopQuestionRequest = QuestionRequest & {
  desktopId: string
  desktopName: string
}

export function scopedRequestId(desktopId: string, requestId: string) {
  return `${desktopId}:${requestId}`
}

export function aggregateDesktopHandoff(
  desktops: Array<{
    desktopId: string
    desktopName: string
    approvals: ApprovalRequest[]
    questions: QuestionRequest[]
  }>,
) {
  return desktops.reduce(
    (result, desktop) => {
      result.approvals.push(
        ...desktop.approvals.map((request) => ({
          ...request,
          desktopId: desktop.desktopId,
          desktopName: desktop.desktopName,
        })),
      )
      result.questions.push(
        ...desktop.questions.map((request) => ({
          ...request,
          desktopId: desktop.desktopId,
          desktopName: desktop.desktopName,
        })),
      )
      return result
    },
    {
      approvals: [] as DesktopApprovalRequest[],
      questions: [] as DesktopQuestionRequest[],
    },
  )
}

export type HandoffListResult<T> = {
  items: T[]
  supported: boolean
  error?: string
}

/**
 * Older desktops do not expose every handoff route. A missing route means
 * "nothing pending here", while other failures are reported for that desktop.
 */
export function resolveHandoffList<T>(
  result: PromiseSettledResult<T[]>,
): HandoffListResult<T> {
  if (result.status === 'fulfilled')
    return {
      items: Array.isArray(result.value) ? result.value : [],
      supported: true,
    }
  if (isUnsupportedEndpoint(result.reason))
    return { items: [], supported: false }
  return {
    items: [],
    supported: true,
    error:
      result.reason instanceof Error
        ? result.reason.message
        : t('thread.errors.loadInbox'),
  }
}

export type QuestionAnswerDraft = {
  selected: string[]
  custom: string
}

export type QuestionAnswerDrafts = Record<number, QuestionAnswerDraft>

export function optionLabel(option: UserQuestion['options'][number]) {
  return option.label
}

export function buildQuestionAnswers(
  questions: UserQuestion[],
  drafts: QuestionAnswerDrafts,
) {
  return questions.map((_, index) => {
    const draft = drafts[index] ?? { selected: [], custom: '' }
    const custom = draft.custom.trim()

    return {
      selected: draft.selected,
      ...(custom ? { custom } : {}),
    }
  })
}

export function handoffCount(
  approvals: ApprovalRequest[],
  questions: QuestionRequest[],
) {
  return approvals.length + questions.length
}

export function pendingForThread<
  A extends ApprovalRequest,
  Q extends QuestionRequest,
>(threadId: string, approvals: A[], questions: Q[]) {
  return {
    approvals: approvals.filter((request) => request.threadId === threadId),
    questions: questions.filter((request) => request.threadId === threadId),
  }
}

export function notificationTarget(request: {
  threadId?: string
  desktopId?: string
}) {
  return request.threadId
    ? request.desktopId
      ? `/d/${encodeURIComponent(request.desktopId)}/threads/${encodeURIComponent(request.threadId)}`
      : `/threads/${encodeURIComponent(request.threadId)}`
    : '/threads'
}

export function shouldNotifyRequest(
  initialized: boolean,
  knownRequestIds: ReadonlySet<string>,
  request: { requestId: string },
) {
  return initialized && !knownRequestIds.has(request.requestId)
}
