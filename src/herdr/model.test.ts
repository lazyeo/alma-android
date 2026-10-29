import { describe, expect, it } from 'vitest'
import {
  agentListFromSnapshot,
  parseBlockedPrompt,
  shouldNotifyAgentStatus,
  type HerdrSnapshot,
} from './model'

const snapshot: HerdrSnapshot = {
  version: '0.9.5',
  protocol: 22,
  workspaces: [
    { workspace_id: 'w1', label: 'App' },
    { workspace_id: 'w2', label: 'Site' },
  ],
  tabs: [
    { tab_id: 't1', workspace_id: 'w1', label: 'Build' },
    { tab_id: 't2', workspace_id: 'w1', label: 'Review' },
  ],
  panes: [
    {
      pane_id: 'p1',
      workspace_id: 'w1',
      tab_id: 't1',
      agent: 'claude',
      agent_status: 'working',
      terminal_title_stripped: 'Implement transport',
    },
    {
      pane_id: 'p2',
      workspace_id: 'w1',
      tab_id: 't2',
      agent: 'codex',
      agent_status: 'blocked',
      terminal_title_stripped: 'Approve tests',
    },
    {
      pane_id: 'p3',
      workspace_id: 'w2',
      tab_id: 't3',
      agent_status: 'unknown',
    },
  ],
}

describe('agentListFromSnapshot', () => {
  it('groups agent panes by workspace and puts blocked panes first', () => {
    expect(agentListFromSnapshot(snapshot)).toEqual([
      {
        id: 'w1',
        label: 'App',
        panes: [
          expect.objectContaining({
            id: 'p2',
            agent: 'codex',
            status: 'blocked',
          }),
          expect.objectContaining({
            id: 'p1',
            agent: 'claude',
            status: 'working',
          }),
        ],
      },
    ])
  })
})

describe('parseBlockedPrompt', () => {
  it('extracts a numbered Yes/No question and exact option keys', () => {
    expect(
      parseBlockedPrompt(
        `Run this command?\n❯ 1. Yes, allow once\n  2. Yes, and remember\n  3. No, deny`,
      ),
    ).toEqual({
      question: 'Run this command?',
      allow: { key: '1', label: 'Yes, allow once' },
      deny: { key: '3', label: 'No, deny' },
    })
  })

  it('accepts menu chrome and rejects menus without a later No option', () => {
    expect(
      parseBlockedPrompt(`│ Delete the file? │\n│ 1. Yes │\n│ 2. No │`),
    ).toEqual({
      question: 'Delete the file?',
      allow: { key: '1', label: 'Yes' },
      deny: { key: '2', label: 'No' },
    })
    expect(parseBlockedPrompt('Continue?\n1. Yes')).toBeNull()
  })
})

describe('shouldNotifyAgentStatus', () => {
  it('notifies for blocked or done-after-working unless muted or viewed', () => {
    const base = { workspaceId: 'w1', muted: false, viewingPane: false }
    expect(
      shouldNotifyAgentStatus({ ...base, from: 'working', to: 'blocked' }),
    ).toBe(true)
    expect(
      shouldNotifyAgentStatus({ ...base, from: 'working', to: 'done' }),
    ).toBe(true)
    expect(shouldNotifyAgentStatus({ ...base, from: 'idle', to: 'done' })).toBe(
      false,
    )
    expect(
      shouldNotifyAgentStatus({
        ...base,
        from: 'working',
        to: 'blocked',
        muted: true,
      }),
    ).toBe(false)
    expect(
      shouldNotifyAgentStatus({
        ...base,
        from: 'working',
        to: 'blocked',
        viewingPane: true,
      }),
    ).toBe(false)
  })
})

describe('mergeChatItems', () => {
  it('deduplicates live items and preserves transcript order across paging', async () => {
    const { mergeChatItems } = await import('./model')
    const current = [
      { id: '2', kind: 'assistant', text: 'second' },
      { id: '3', kind: 'assistant', text: 'third' },
    ]
    expect(
      mergeChatItems(
        current,
        [
          { id: '1', kind: 'user', text: 'first' },
          { id: '2', kind: 'assistant', text: 'second updated' },
        ],
        'prepend',
      ),
    ).toEqual([
      { id: '1', kind: 'user', text: 'first' },
      { id: '2', kind: 'assistant', text: 'second updated' },
      { id: '3', kind: 'assistant', text: 'third' },
    ])
    expect(
      mergeChatItems(
        current,
        [
          { id: '3', kind: 'assistant', text: 'third updated' },
          { id: '4', kind: 'tool', text: 'fourth' },
        ],
        'append',
      ),
    ).toEqual([
      { id: '2', kind: 'assistant', text: 'second' },
      { id: '3', kind: 'assistant', text: 'third updated' },
      { id: '4', kind: 'tool', text: 'fourth' },
    ])
  })
})
