import { describe, expect, it } from 'vitest'
import {
  formatSubagentElapsed,
  listSubagents,
  runningCount,
  subagentStepRows,
} from './subagents'

const items = [
  {
    id: 'before',
    kind: 'assistant',
    time: 900,
    text: 'Preparing',
  },
  {
    id: 'dispatch-1',
    kind: 'tool',
    time: 1_000,
    tool: {
      id: 'tool-1',
      name: 'Task',
      summary: 'Fallback summary',
      input: {
        description: 'Inspect reconnect flow',
        subagent_type: 'general-purpose',
        prompt: 'Inspect it',
      },
      done: false,
    },
  },
  {
    id: 'dispatch-2',
    kind: 'tool',
    time: '2026-01-02T03:04:05Z',
    tool: {
      id: 'tool-2',
      name: 'Task',
      summary: 'Run UI review',
      input: { subagent_type: 'reviewer' },
      done: true,
      is_error: true,
    },
  },
  {
    id: 'not-task',
    kind: 'tool',
    tool: { id: 'tool-3', name: 'Bash', done: false },
  },
]

describe('Herdr subagent model', () => {
  it('lists Task dispatches in source order with fallbacks and state', () => {
    expect(listSubagents(items)).toEqual([
      {
        toolId: 'tool-1',
        title: 'Inspect reconnect flow',
        type: 'general-purpose',
        startedAt: 1_000,
        running: true,
        error: false,
      },
      {
        toolId: 'tool-2',
        title: 'Run UI review',
        type: 'reviewer',
        startedAt: Date.parse('2026-01-02T03:04:05Z'),
        running: false,
        error: true,
      },
    ])
  })

  it('counts only unfinished Task dispatches', () => {
    expect(runningCount(listSubagents(items))).toBe(1)
  })

  it('formats elapsed time with the shared status formatter', () => {
    expect(formatSubagentElapsed(83_000)).toBe('1:23')
  })

  it('builds compact tool step rows and gives errors precedence', () => {
    expect(
      subagentStepRows([
        { id: 'text', kind: 'assistant', text: 'Checking' },
        {
          id: 'step-1',
          kind: 'tool',
          tool: { name: 'Bash', summary: 'Run tests', done: true },
        },
        {
          id: 'step-2',
          kind: 'tool',
          tool: { name: 'Read', summary: 'Inspect output', done: false },
        },
        {
          id: 'step-3',
          kind: 'tool',
          tool: { name: 'Edit', is_error: true, done: false },
        },
      ]),
    ).toEqual([
      { toolName: 'Bash', summary: 'Run tests', state: 'done' },
      { toolName: 'Read', summary: 'Inspect output', state: 'running' },
      { toolName: 'Edit', summary: '', state: 'error' },
    ])
  })
})
