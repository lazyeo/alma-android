export interface DraftReference {
  label: string
  uri: string
  kind: string
}

const TOKEN = /@\[([^\]\n]{1,200})\]\((alma:\/\/[^\s()]+)\)/g
const kindFromUri = (uri: string) =>
  /^alma:\/\/([^/]+)/.exec(uri)?.[1] ?? 'reference'

export function sanitizeReferenceLabel(label: string, used: string[] = []) {
  const base =
    label
      .replace(/[\[\]()]/g, '')
      .replace(/[\r\n\t]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'untitled'
  let candidate = label.length > 80 ? `${base}…` : base
  let number = 2
  while (used.includes(candidate)) candidate = `${base} ${number++}`
  return candidate
}

export function parseMaterializedReferences(materialized: string) {
  const references: DraftReference[] = []
  const used: string[] = []
  const text = materialized.replace(
    TOKEN,
    (_token, rawLabel: string, uri: string) => {
      const label = sanitizeReferenceLabel(rawLabel, used)
      used.push(label)
      references.push({ label, uri, kind: kindFromUri(uri) })
      return `@${label}`
    },
  )
  return { text, references }
}

export function materializeReferences(
  text: string,
  references: DraftReference[],
) {
  let result = text
  for (const ref of [...references].sort(
    (a, b) => b.label.length - a.label.length,
  )) {
    const needle = `@${ref.label}`
    let index = 0
    while ((index = result.indexOf(needle, index)) >= 0) {
      const after = result[index + needle.length]
      if (!after || /[^\p{L}\p{N}_]/u.test(after)) {
        result = `${result.slice(0, index)}@[${ref.label}](${ref.uri})${result.slice(index + needle.length)}`
        break
      }
      index += needle.length
    }
  }
  return result
}

export function insertReference(
  text: string,
  start: number,
  end: number,
  input: Omit<DraftReference, 'label'> & { title: string },
  references: DraftReference[],
) {
  const label = sanitizeReferenceLabel(
    input.title,
    references.map((ref) => ref.label),
  )
  const replacement = `@${label} `
  return {
    text: text.slice(0, start) + replacement + text.slice(end),
    caret: start + replacement.length,
    references: [...references, { label, uri: input.uri, kind: input.kind }],
  }
}

export function pruneReferences(text: string, references: DraftReference[]) {
  return references.filter((ref) => text.includes(`@${ref.label}`))
}

export function deleteReferenceAtCaret(
  text: string,
  caret: number,
  references: DraftReference[],
) {
  for (const ref of [...references].sort(
    (a, b) => b.label.length - a.label.length,
  )) {
    const token = `@${ref.label}`
    const withSpace = `${token} `
    const start = caret - token.length
    const spacedStart = caret - withSpace.length
    if (spacedStart >= 0 && text.slice(spacedStart, caret) === withSpace) {
      return {
        text: text.slice(0, spacedStart) + text.slice(caret),
        caret: spacedStart,
        references: references.filter((item) => item !== ref),
      }
    }
    if (start >= 0 && text.slice(start, caret) === token) {
      return {
        text: text.slice(0, start) + text.slice(caret),
        caret: start,
        references: references.filter((item) => item !== ref),
      }
    }
  }
}

export function referenceSegments(text: string) {
  const segments: Array<
    | { type: 'text'; value: string }
    | { type: 'ref'; label: string; uri: string; kind: string }
  > = []
  let index = 0
  for (const match of text.matchAll(TOKEN)) {
    if (match.index! > index)
      segments.push({ type: 'text', value: text.slice(index, match.index) })
    segments.push({
      type: 'ref',
      label: match[1],
      uri: match[2],
      kind: kindFromUri(match[2]),
    })
    index = match.index! + match[0].length
  }
  if (index < text.length)
    segments.push({ type: 'text', value: text.slice(index) })
  return segments
}

/** Display text split so tracked `@label` tokens can be painted behind the textarea. */
export function highlightSegments(text: string, references: DraftReference[]) {
  const segments: Array<{ text: string; ref?: DraftReference }> = []
  const sorted = [...references].sort((a, b) => b.label.length - a.label.length)
  let plain = ''
  let index = 0
  while (index < text.length) {
    const ref =
      text[index] === '@'
        ? sorted.find((item) => text.startsWith(`@${item.label}`, index))
        : undefined
    if (!ref) {
      plain += text[index++]
      continue
    }
    if (plain) segments.push({ text: plain })
    plain = ''
    segments.push({ text: `@${ref.label}`, ref })
    index += ref.label.length + 1
  }
  if (plain) segments.push({ text: plain })
  return segments
}

interface MdNode {
  type: string
  value?: string
  url?: string
  children?: MdNode[]
}

/**
 * Remark transform: `@[label](alma://…)` parses as text "@" + link, so the
 * trailing "@" is dropped and the link alone renders as a reference chip.
 */
export function stripReferenceAtSigns(node: MdNode) {
  const children = node.children ?? []
  children.forEach((child, index) => {
    const next = children[index + 1]
    if (
      child.type === 'text' &&
      child.value?.endsWith('@') &&
      next?.type === 'link' &&
      next.url?.startsWith('alma://')
    )
      child.value = child.value.slice(0, -1)
    stripReferenceAtSigns(child)
  })
}

/** True when `index` is the `@` of a tracked token, which must not reopen the picker. */
export function isReferenceTokenAt(
  text: string,
  index: number,
  references: DraftReference[],
) {
  return references.some((ref) => text.startsWith(`@${ref.label}`, index))
}

/** Desktop names an untitled snippet by its first line, 40 characters. */
export function snippetLabel(text: string) {
  const line =
    text
      .split('\n')
      .map((item) => item.replace(/\s+/g, ' ').trim())
      .find(Boolean) ?? ''
  return line.length > 40 ? `${line.slice(0, 40).trimEnd()}…` : line
}

/** Message references use the row id (`threadId--msgId`), as desktop does. */
export function messageReferenceUri(threadId: string, rowId: string) {
  return `alma://thread/${encodeURIComponent(threadId)}/message/${encodeURIComponent(rowId)}`
}

export function quoteMarkdown(text: string) {
  const body = text.replace(/\r\n/g, '\n').trim()
  if (!body) return ''
  return body
    .split('\n')
    .map((line) => (line.trim() ? `> ${line}` : '>'))
    .join('\n')
}

/** Appends a quote block after the draft, leaving the caret on a new line. */
export function appendQuote(draft: string, text: string) {
  const quote = quoteMarkdown(text)
  if (!quote) return draft
  const head = draft.replace(/\s+$/, '')
  return `${head ? `${head}\n\n` : ''}${quote}\n\n`
}

/** Adds a reference token at the end of the draft. */
export function appendReference(
  draft: string,
  input: Omit<DraftReference, 'label'> & { title: string },
  references: DraftReference[],
) {
  const base = draft && !/\s$/.test(draft) ? `${draft} ` : draft
  return insertReference(base, base.length, base.length, input, references)
}
