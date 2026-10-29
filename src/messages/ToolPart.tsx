import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import type { MessagePart } from './index'
import { ToolIcon } from './ToolIcon'
import { LoadingOrb } from '../screens/LoadingOrbCanvas'
import { TodoList } from '../screens/TodoProgress'
import { taskToolResult, toolOutputText } from '../screens/messageParts'
import { toolState } from '../screens/streamingPresentation'
import { taskPromptDisclosure, toolInputSummary } from '../screens/toolSummary'
import { toolDuration } from '../screens/toolDurations'
import { formatElapsed } from '../screens/threadStatus'
import { todosFromToolPart } from '../screens/threadTodos'
import { useSharedSecond } from '../screens/useSharedSecond'
import { useT } from '../i18n'

export interface NestedMessageRow {
  id: string
  message: { parts: MessagePart[] }
}

export function ToolPart({
  part,
  nested,
  renderMarkdown,
  renderNestedRuns,
  nestedActivity,
}: {
  part: MessagePart
  nested?: readonly NestedMessageRow[]
  renderMarkdown: (text: string) => ReactNode
  renderNestedRuns?: (
    rows: readonly NestedMessageRow[],
    live: boolean,
  ) => ReactNode
  nestedActivity?: (rows: readonly NestedMessageRow[]) => string | undefined
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const name =
    typeof part.toolName === 'string'
      ? part.toolName
      : part.type.replace(/^tool-/, '')
  const output = toolOutputText(part)
  const task = taskToolResult(name, part)
  const state = task?.failed ? 'error' : toolState(part)
  const tail = useRef<HTMLPreElement>(null)
  useEffect(() => {
    if (tail.current) tail.current.scrollTop = tail.current.scrollHeight
  }, [output])
  const input =
    typeof part.input === 'string'
      ? part.input
      : JSON.stringify(part.input ?? {})
  const summary = toolInputSummary(name, part)
  const taskPrompt = task ? taskPromptDisclosure(part) : undefined
  const todos = name === 'TodoWrite' ? todosFromToolPart(part) : []
  const activity =
    state === 'running' && nested?.length && nestedActivity
      ? nestedActivity(nested)
      : undefined
  const now = useSharedSecond(state === 'running')
  const duration = toolDuration(part, now)
  return (
    <div className={`tool-card ${state}`}>
      <button
        className="tool-summary"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <ToolIcon name={name} />
        <span>{name}</span>
        <span className={`tool-input${summary.mono ? ' mono' : ''}`}>
          <span>{summary.text}</span>
          {summary.detail ? <small>{summary.detail}</small> : null}
        </span>
        {duration !== undefined && duration >= 1000 ? (
          <time className="tool-duration">{formatElapsed(duration)}</time>
        ) : null}
        {state === 'running' ? (
          <LoadingOrb size={16} />
        ) : state === 'error' ? (
          <X size={16} />
        ) : (
          <Check size={16} />
        )}
      </button>
      {activity && !open ? (
        <p className="tool-activity">{activity}</p>
      ) : state === 'running' && output && !open ? (
        <pre className="live-tail" ref={tail}>
          {output}
        </pre>
      ) : null}
      {open ? (
        <>
          {task ? (
            taskPrompt ? (
              <details className="tool-prompt">
                <summary>{t('message.prompt')}</summary>
                {renderMarkdown(taskPrompt)}
              </details>
            ) : null
          ) : todos.length ? (
            <TodoList todos={todos} />
          ) : (
            <pre>{input}</pre>
          )}
          {task ? (
            <div className="tool-result">
              {task.failed ? (
                <span className="tool-result-status">{task.status}</span>
              ) : null}
              {task.result ? renderMarkdown(task.result) : null}
            </div>
          ) : name === 'TodoWrite' ? null : output ? (
            <pre>{output}</pre>
          ) : null}
          {nested?.length && renderNestedRuns
            ? renderNestedRuns(nested, state === 'running')
            : null}
        </>
      ) : null}
    </div>
  )
}
