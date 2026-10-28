import { Circle, CircleCheck, CircleDot, ListChecks } from 'lucide-react'
import { BottomSheet } from '../components/BottomSheet'
import { haptic } from '../haptics'
import type { TodoItem, TodoProgress } from './threadTodos'
import { useT } from '../i18n'

/** "3/7 Writing tests": the count plus the step in progress, nothing else. */
export function TodoProgressButton({
  progress,
  onOpen,
}: {
  progress: Extract<TodoProgress, { visible: true }>
  onOpen(): void
}) {
  const t = useT()
  return (
    <button
      className="todo-progress"
      aria-label={t('message.todos.progress', {
        done: progress.done,
        total: progress.total,
      })}
      onClick={() => {
        void haptic('light')
        onOpen()
      }}
    >
      <ListChecks size={16} strokeWidth={2} aria-hidden="true" />
      <span className="todo-progress-count">
        {progress.done}/{progress.total}
      </span>
      {progress.current ? (
        <span className="todo-progress-current">{progress.current}</span>
      ) : null}
    </button>
  )
}

const STATUS_ICON = {
  completed: CircleCheck,
  in_progress: CircleDot,
} as const

export function TodoList({ todos }: { todos: readonly TodoItem[] }) {
  return (
    <ol className="sheet-list todo-list">
      {todos.map((todo, index) => {
        const Icon =
          STATUS_ICON[todo.status as keyof typeof STATUS_ICON] ?? Circle
        return (
          <li
            key={`${index}-${todo.content}`}
            className={`sheet-row compact todo-item ${todo.status}`}
          >
            <Icon size={16} strokeWidth={2} aria-hidden="true" />
            <span className="sheet-row-copy">
              <span>
                {todo.status === 'in_progress'
                  ? todo.activeForm || todo.content
                  : todo.content}
              </span>
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function TodoSheet({
  todos,
  onClose,
}: {
  todos: readonly TodoItem[]
  onClose(): void
}) {
  const t = useT()
  return (
    <BottomSheet
      title={t('message.todos.list')}
      className="todo-sheet"
      onClose={onClose}
    >
      <TodoList todos={todos} />
    </BottomSheet>
  )
}
