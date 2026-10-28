import { expect, it } from 'vitest'
import {
  taskPromptDisclosure,
  todoToolSummary,
  toolInputSummary,
} from './toolSummary'

it('summarizes commands and file paths without raw JSON', () => {
  expect(
    toolInputSummary('Bash', {
      type: 'tool-Bash',
      input: { command: 'npm test -- threadQueue' },
    }),
  ).toEqual({ text: 'npm test -- threadQueue', mono: true })
  expect(
    toolInputSummary('Read', {
      type: 'tool-Read',
      input: { file_path: 'src/screens/threadQueue.ts' },
    }),
  ).toEqual({
    text: 'threadQueue.ts',
    detail: 'src/screens',
    mono: true,
  })
})

it('uses tool-specific web, search, and task summaries', () => {
  expect(
    toolInputSummary('WebFetch', {
      type: 'tool-WebFetch',
      input: { url: 'https://example.com/docs/start?mode=full' },
    }).text,
  ).toBe('example.com/docs/start')
  expect(
    toolInputSummary('Grep', {
      type: 'tool-Grep',
      input: { pattern: 'reasoningLive' },
    }).text,
  ).toBe('reasoningLive')
  expect(
    toolInputSummary('Task', {
      type: 'tool-Task',
      input: { description: 'Inspect the rendering path' },
    }).text,
  ).toBe('Inspect the rendering path')
})

it('summarizes TodoWrite from its checklist', () => {
  const todos = [
    { content: 'Inspect', status: 'completed' },
    { content: 'Fix', status: 'in_progress' },
  ]
  expect(todoToolSummary({ type: 'tool-TodoWrite', input: { todos } })).toBe(
    '1/2 done',
  )
  expect(
    todoToolSummary({ type: 'tool-TodoWrite', input: { todos: [] } }),
  ).toBe('To-do list')
})

it('only exposes a long Task prompt through its disclosure', () => {
  expect(
    taskPromptDisclosure({
      type: 'tool-Task',
      input: { description: 'Review', prompt: 'Short prompt' },
    }),
  ).toBeUndefined()
  expect(
    taskPromptDisclosure({
      type: 'tool-Task',
      input: { description: 'Review', prompt: 'x'.repeat(161) },
    }),
  ).toBe('x'.repeat(161))
})

it('falls back to the first nested string value', () => {
  expect(
    toolInputSummary('Custom', {
      type: 'dynamic-tool',
      input: { options: { label: 'Useful fallback' } },
    }),
  ).toEqual({ text: 'Useful fallback', mono: false })
})
