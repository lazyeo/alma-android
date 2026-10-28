import type { RefKind } from '../relay'

export interface RefTrigger {
  start: number
  end: number
  query: string
  kind?: string
}

export function detectRefTrigger(
  text: string,
  selectionStart: number,
  kinds: Pick<RefKind, 'kind' | 'prefixes'>[],
): RefTrigger | undefined {
  const before = text.slice(0, selectionStart).replaceAll('＠', '@')
  const at = before.lastIndexOf('@')
  if (at < 0 || /[\w@]/u.test(before[at - 1] ?? '')) return undefined
  const raw = before.slice(at + 1)
  // A bare @ opens the picker on recents.
  if (!raw) return { start: at, end: selectionStart, query: '' }
  if (raw.startsWith('[') || raw.length > 64 || /\s{2}/u.test(raw))
    return undefined
  const strict = /^[^\s@]*$/u.test(raw)
  const loose = /^[^@\n\r]{1,64}$/u.test(raw)
  if (!strict && !loose) return undefined
  const prefix = /^([^:：]{1,24})[:：](.*)$/u.exec(raw)
  if (!prefix) return { start: at, end: selectionStart, query: raw }
  const wanted = prefix[1].toLocaleLowerCase()
  const match = kinds.find(
    (item) =>
      item.kind.toLocaleLowerCase() === wanted ||
      item.prefixes.some((value) => value.toLocaleLowerCase() === wanted),
  )
  return match
    ? { start: at, end: selectionStart, query: prefix[2], kind: match.kind }
    : { start: at, end: selectionStart, query: raw }
}
