import { describe, expect, it } from 'vitest'
import type { MessageRow } from '../relay'
import { todoProgress, todosFromEvent, todosFromRows } from './threadTodos'

const todos = [
  { content: 'Read code', activeForm: 'Reading code', status: 'completed' },
  {
    content: 'Write tests',
    activeForm: 'Writing tests',
    status: 'in_progress',
  },
  { content: 'Ship', activeForm: 'Shipping', status: 'pending' },
]

const row = (
  id: string,
  role: string,
  parts: MessageRow['message']['parts'],
): MessageRow => ({
  id,
  threadId: 't1',
  message: { id, role, parts },
})

const todoWrite = (input: unknown, output?: unknown) => ({
  type: 'tool-TodoWrite',
  toolCallId: `call-${Math.random()}`,
  state: output ? 'output-available' : 'input-available',
  input,
  output,
})

describe('thread todos', () => {
  it('derives history from the last TodoWrite, output before input', () => {
    const older = todos.map((todo) => ({ ...todo, status: 'pending' }))
    const rows = [
      row('a', 'assistant', [todoWrite({ todos: older }, { todos: older })]),
      row('b', 'assistant', [
        todoWrite({ todos: older }, { todos }),
        { type: 'text', text: 'Working' },
      ]),
      row('c', 'user', [{ type: 'text', text: 'ok' }]),
    ]
    expect(todosFromRows(rows)).toEqual(todos)
    expect(
      todosFromRows([row('a', 'assistant', [todoWrite({ todos })])]),
    ).toEqual(todos)
    expect(todosFromRows([row('a', 'assistant', [])])).toEqual([])
  })

  it('reads live todo_update frames for this thread only', () => {
    const event = { type: 'todo_update', data: { threadId: 't1', todos } }
    expect(todosFromEvent('t1', event)).toEqual(todos)
    expect(todosFromEvent('t2', event)).toBeUndefined()
    expect(
      todosFromEvent('t1', { type: 'message_delta', data: { threadId: 't1' } }),
    ).toBeUndefined()
  })

  it('reports count and the active step', () => {
    expect(todoProgress(todos, true)).toEqual({
      visible: true,
      done: 1,
      total: 3,
      current: 'Writing tests',
    })
    expect(
      todoProgress(
        todos.map((todo) => ({ ...todo, activeForm: undefined })),
        false,
      ),
    ).toMatchObject({ current: 'Write tests' })
  })

  it('hides with no todos, and when all are done once the turn ends', () => {
    const done = todos.map((todo) => ({ ...todo, status: 'completed' }))
    expect(todoProgress([], true)).toEqual({ visible: false })
    expect(todoProgress(done, true)).toMatchObject({
      visible: true,
      done: 3,
      total: 3,
      current: undefined,
    })
    expect(todoProgress(done, false)).toEqual({ visible: false })
  })
})
