import { describe, expect, it } from 'vitest'
import { translatorFor } from '../i18n/runtime'
import { personalAgentSubtitle } from './personalAgent'

const en = translatorFor('en')
const zh = translatorFor('zh')
const idle = {
  running: 0,
  pendingApprovals: 0,
  today: { spentUsd: 0, budgetUsd: 5, over: false },
}

describe('personalAgentSubtitle', () => {
  it('is empty when nothing is worth reporting', () => {
    expect(personalAgentSubtitle(idle, undefined, en)).toEqual([])
  })

  it('composes mood, running, approvals, and spend in order', () => {
    expect(
      personalAgentSubtitle(
        {
          running: 2,
          pendingApprovals: 1,
          today: { spentUsd: 1.234, budgetUsd: 5, over: false },
        },
        'Happy',
        en,
      ),
    ).toEqual([
      { kind: 'mood', text: 'Happy' },
      { kind: 'running', text: '2 running' },
      { kind: 'approvals', text: '1 approval', emphasized: true },
      { kind: 'spend', text: '$1.23 / $5.00' },
    ])
  })

  it('omits unknown moods and zero counters', () => {
    expect(
      personalAgentSubtitle(
        { ...idle, today: { spentUsd: 0.5, budgetUsd: null, over: false } },
        'melancholic-ish',
        en,
      ),
    ).toEqual([{ kind: 'spend', text: '$0.50' }])
  })

  it('localizes labels and pluralizes counts', () => {
    expect(
      personalAgentSubtitle(
        { ...idle, running: 3, pendingApprovals: 2 },
        'tired',
        en,
      ).map((part) => part.text),
    ).toEqual(['3 running', '2 approvals'])
    expect(
      personalAgentSubtitle(
        { ...idle, running: 3, pendingApprovals: 2 },
        'SAD',
        zh,
      ).map((part) => part.text),
    ).toEqual(['难过', '3 个运行中', '2 个待审批'])
  })
})
