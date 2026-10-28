import { describe, expect, it } from 'vitest'
import { AlmaHttpError } from '../relay'
import type { ApprovalRequest, QuestionRequest } from '../relay'
import {
  buildQuestionAnswers,
  handoffCount,
  notificationTarget,
  optionLabel,
  pendingForThread,
  shouldNotifyRequest,
  aggregateDesktopHandoff,
  scopedRequestId,
  resolveHandoffList,
} from './inboxModel'

describe('inbox question answers', () => {
  it('uses option labels and preserves question order', () => {
    const questions = [
      {
        header: 'Single',
        question: 'Choose one',
        multiSelect: false,
        options: [
          { label: 'Alpha', description: 'First choice' },
          { label: 'Beta' },
        ],
      },
      {
        header: 'Multiple',
        question: 'Choose many',
        multiSelect: true,
        options: [{ label: 'Gamma' }, { label: 'delta' }],
      },
    ]

    expect(
      buildQuestionAnswers(questions, {
        0: { selected: ['Alpha'], custom: '' },
        1: { selected: ['Gamma', 'delta'], custom: 'Other' },
      }),
    ).toEqual([
      { selected: ['Alpha'] },
      { selected: ['Gamma', 'delta'], custom: 'Other' },
    ])
  })

  it('uses the protocol option label', () => {
    expect(optionLabel({ label: 'Two', description: 'Second' })).toBe('Two')
  })
})

describe('shared handoff state', () => {
  const approvals: ApprovalRequest[] = [
    {
      requestId: 'approval-a',
      source: 'bash',
      title: 'Run command?',
      message: 'echo ok',
      type: 'warning',
      threadId: 'thread-a',
    },
    {
      requestId: 'approval-global',
      source: 'ptc',
      title: 'Global request',
      message: 'Confirm',
      type: 'warning',
    },
  ]
  const questions: QuestionRequest[] = [
    {
      requestId: 'question-a',
      source: 'claude',
      threadId: 'thread-a',
      questions: [
        {
          header: 'Choice',
          question: 'Pick one',
          multiSelect: false,
          allowCustomAnswer: true,
          options: [{ label: 'Alpha' }],
        },
      ],
    },
    {
      requestId: 'question-b',
      source: 'codex',
      threadId: 'thread-b',
      questions: [],
    },
  ]

  it('counts all pending requests but filters inline cards by thread', () => {
    expect(handoffCount(approvals, questions)).toBe(4)
    expect(pendingForThread('thread-a', approvals, questions)).toEqual({
      approvals: [approvals[0]],
      questions: [questions[0]],
    })
  })

  it('routes request notifications to their thread or the thread list', () => {
    expect(notificationTarget(approvals[0])).toBe('/threads/thread-a')
    expect(notificationTarget(approvals[1])).toBe('/threads')
  })

  it('notifies only new request ids after the initial snapshot', () => {
    const known = new Set(['approval-a'])
    expect(shouldNotifyRequest(false, known, approvals[0])).toBe(false)
    expect(shouldNotifyRequest(true, known, approvals[0])).toBe(false)
    expect(shouldNotifyRequest(true, known, approvals[1])).toBe(true)
  })

  it('aggregates and tags requests from every desktop without id collisions', () => {
    const aggregated = aggregateDesktopHandoff([
      {
        desktopId: 'home',
        desktopName: 'Home Mac',
        approvals: [approvals[0]],
        questions: [],
      },
      {
        desktopId: 'mini',
        desktopName: 'Mac mini',
        approvals: [{ ...approvals[0] }],
        questions: [questions[1]],
      },
    ])
    expect(aggregated.approvals.map((item) => item.desktopName)).toEqual([
      'Home Mac',
      'Mac mini',
    ])
    expect(aggregated.questions[0].desktopId).toBe('mini')
    expect(scopedRequestId('home', 'approval-a')).not.toBe(
      scopedRequestId('mini', 'approval-a'),
    )
    expect(notificationTarget(aggregated.questions[0])).toBe(
      '/d/mini/threads/thread-b',
    )
  })
})

describe('handoff feature detection', () => {
  it('treats missing handoff routes as unsupported and empty', () => {
    expect(
      resolveHandoffList({
        status: 'rejected',
        reason: new AlmaHttpError('GET failed (404)', 404),
      }),
    ).toEqual({ items: [], supported: false })
  })

  it('keeps fulfilled lists and reports genuine failures', () => {
    expect(
      resolveHandoffList({ status: 'fulfilled', value: [{ requestId: 'a' }] }),
    ).toEqual({ items: [{ requestId: 'a' }], supported: true })
    expect(
      resolveHandoffList({
        status: 'rejected',
        reason: new AlmaHttpError('GET failed (500): boom', 500),
      }),
    ).toEqual({
      items: [],
      supported: true,
      error: 'GET failed (500): boom',
    })
  })
})
