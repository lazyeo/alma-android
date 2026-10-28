import type { MessageRow, RealtimeEvent } from '../relay'

// Port of Desktop's useThreadTodos: the checklist comes from the last
// TodoWrite call in the thread, overridden by live `todo_update` frames.

export interface TodoItem {
  content: string
  activeForm?: string
  /** `pending` | `in_progress` | `completed` */
  status: string
}

function readTodos(value: unknown): TodoItem[] | undefined {
  if (!Array.isArray(value) || !value.length) return undefined
  return value
    .filter(
      (item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === 'object',
    )
    .map((item) => ({
      content: typeof item.content === 'string' ? item.content : '',
      ...(typeof item.activeForm === 'string'
        ? { activeForm: item.activeForm }
        : {}),
      status: typeof item.status === 'string' ? item.status : 'pending',
    }))
}

const field = (value: unknown, key: string) =>
  value && typeof value === 'object'
    ? (value as Record<string, unknown>)[key]
    : undefined

export function todosFromToolPart(
  part: MessageRow['message']['parts'][number],
) {
  if (part.type !== 'tool-TodoWrite') return []
  return (
    readTodos(field(part.output, 'todos')) ??
    readTodos(field(part.input, 'todos')) ??
    []
  )
}

/** Latest TodoWrite checklist; the output reflects the saved list. */
export function todosFromRows(rows: readonly MessageRow[]): TodoItem[] {
  for (let index = rows.length - 1; index >= 0; index--) {
    const { message } = rows[index]
    if (message.role !== 'assistant') continue
    for (let at = message.parts.length - 1; at >= 0; at--) {
      const part = message.parts[at]
      if (part.type !== 'tool-TodoWrite') continue
      const todos = todosFromToolPart(part)
      if (todos.length) return todos
    }
  }
  return []
}

export function todosFromEvent(
  threadId: string,
  event: Pick<RealtimeEvent, 'type' | 'data'>,
): TodoItem[] | undefined {
  if (event.type !== 'todo_update' || event.data?.threadId !== threadId)
    return undefined
  return readTodos(event.data.todos) ?? []
}

export type TodoProgress =
  | { visible: false }
  | { visible: true; done: number; total: number; current?: string }

/**
 * A finished checklist stays visible only while the turn that finished it is
 * still running; afterwards it is history, not progress.
 */
export function todoProgress(
  todos: readonly TodoItem[],
  generating: boolean,
): TodoProgress {
  const total = todos.length
  const done = todos.filter((todo) => todo.status === 'completed').length
  if (!total || (done === total && !generating)) return { visible: false }
  const active = todos.find((todo) => todo.status === 'in_progress')
  return {
    visible: true,
    done,
    total,
    current: active ? active.activeForm || active.content : undefined,
  }
}
