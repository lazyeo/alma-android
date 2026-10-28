import type { MessagePart } from '../relay'
import { t } from '../i18n/runtime'

const stringValue = (value: unknown) =>
  typeof value === 'string' && value.trim() ? value.trim() : undefined

const firstStringValue = (value: unknown): string | undefined => {
  const direct = stringValue(value)
  if (direct) return direct
  if (!value || typeof value !== 'object') return undefined
  for (const nested of Object.values(value)) {
    const found = firstStringValue(nested)
    if (found) return found
  }
  return undefined
}

const inputRecord = (part: MessagePart): Record<string, unknown> =>
  part.input && typeof part.input === 'object' && !Array.isArray(part.input)
    ? (part.input as Record<string, unknown>)
    : {}

const todoItems = (part: MessagePart) => {
  const input = inputRecord(part)
  const output =
    part.output &&
    typeof part.output === 'object' &&
    !Array.isArray(part.output)
      ? (part.output as Record<string, unknown>)
      : {}
  const value = Array.isArray(output.todos) ? output.todos : input.todos
  return Array.isArray(value) ? value : []
}

export function todoToolSummary(part: MessagePart) {
  const todos = todoItems(part)
  if (!todos.length) return t('message.todos.list')
  const done = todos.filter(
    (todo) =>
      todo &&
      typeof todo === 'object' &&
      (todo as Record<string, unknown>).status === 'completed',
  ).length
  return t('message.todos.done', { done, total: todos.length })
}

export function taskPromptDisclosure(part: MessagePart) {
  const prompt = stringValue(inputRecord(part).prompt)
  return prompt && prompt.length > 160 ? prompt : undefined
}

const pathSummary = (value: string) => {
  const normalized = value.replaceAll('\\', '/')
  const slash = normalized.lastIndexOf('/')
  if (slash < 0) return { text: normalized, mono: true }
  const name = normalized.slice(slash + 1) || normalized
  const directory = normalized.slice(0, slash) || '/'
  return { text: name, detail: directory, mono: true }
}

export interface ToolSummary {
  text: string
  detail?: string
  mono: boolean
}

export function toolInputSummary(name: string, part: MessagePart): ToolSummary {
  const input = inputRecord(part)
  const normalizedName = name.toLowerCase()

  if (normalizedName === 'bash') {
    return {
      text:
        stringValue(input.command) ??
        firstStringValue(part.input) ??
        t('message.tool.runningCommand'),
      mono: true,
    }
  }

  if (['read', 'write', 'edit'].includes(normalizedName)) {
    const path =
      stringValue(input.file_path) ??
      stringValue(input.path) ??
      firstStringValue(part.input)
    return path
      ? pathSummary(path)
      : { text: t('message.tool.file'), mono: true }
  }

  if (normalizedName === 'webfetch') {
    const value = stringValue(input.url) ?? firstStringValue(part.input)
    if (value) {
      try {
        const url = new URL(value)
        return { text: `${url.host}${url.pathname}`, mono: false }
      } catch {
        return { text: value, mono: false }
      }
    }
  }

  if (['websearch', 'grep', 'glob'].includes(normalizedName)) {
    return {
      text:
        stringValue(input.query) ??
        stringValue(input.pattern) ??
        firstStringValue(part.input) ??
        t('message.tool.search'),
      mono: false,
    }
  }

  if (normalizedName === 'task') {
    return {
      text:
        stringValue(input.description) ??
        firstStringValue(part.input) ??
        t('message.tool.task'),
      mono: false,
    }
  }

  if (normalizedName === 'todowrite') {
    return { text: todoToolSummary(part), mono: false }
  }

  return {
    text: firstStringValue(part.input) ?? t('message.tool.input'),
    mono: false,
  }
}
