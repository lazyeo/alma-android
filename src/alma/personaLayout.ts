import type { MessagePart } from '../messages'
import { toolState } from '../screens/streamingPresentation'

export type PersonaSide = 'alma' | 'user'

export interface PersonaRowLayout {
  side: PersonaSide
  /** First of a run from the same side: only this one shows Alma's avatar. */
  first: boolean
  last: boolean
}

interface RoleRow {
  message: { role: string }
}

/** Anything not typed by the user is Alma speaking, tools included. */
export const personaSide = (role: string): PersonaSide =>
  role === 'user' ? 'user' : 'alma'

/** Messenger grouping: consecutive rows from one side form one run. */
export function personaLayout(rows: readonly RoleRow[]): PersonaRowLayout[] {
  const sides = rows.map((row) => personaSide(row.message.role))
  return sides.map((side, index) => ({
    side,
    first: index === 0 || sides[index - 1] !== side,
    last: index === sides.length - 1 || sides[index + 1] !== side,
  }))
}

const isTool = (part: MessagePart) =>
  part.type.startsWith('tool-') || part.type === 'dynamic-tool'

export function toolName(part: MessagePart) {
  return typeof part.toolName === 'string' && part.toolName
    ? part.toolName
    : part.type.replace(/^tool-/, '')
}

export interface PersonaParts {
  /** What goes in the bubble: text, images, files, teammate notes. */
  body: MessagePart[]
  reasoning: MessagePart[]
  /** Distinct tool names in first-use order, for the one "did: …" line. */
  actions: string[]
  /** A tool has no result yet; only meaningful while generating. */
  acting: boolean
}

/**
 * Splits a message for the messenger view. Tools and sub-agents collapse
 * into a single muted line; reasoning is kept aside behind a tap.
 */
export function personaParts(parts: readonly MessagePart[]): PersonaParts {
  const body: MessagePart[] = []
  const reasoning: MessagePart[] = []
  const actions: string[] = []
  let acting = false
  for (const part of parts) {
    if (isTool(part)) {
      const name = toolName(part)
      if (name && !actions.includes(name)) actions.push(name)
      if (toolState(part) === 'running') acting = true
    } else if (part.type === 'reasoning') {
      if (typeof part.text === 'string' && part.text.trim())
        reasoning.push(part)
    } else if (part.type === 'text') {
      if (typeof part.text === 'string' && part.text.trim()) body.push(part)
    } else if (part.type !== 'step-start') body.push(part)
  }
  return { body, reasoning, actions, acting }
}

/** "Read, Bash and Task" in the reader's language. */
export function listActions(actions: readonly string[], locale: string) {
  try {
    return new Intl.ListFormat(locale, {
      style: 'long',
      type: 'conjunction',
    }).format(actions)
  } catch {
    return actions.join(', ')
  }
}
