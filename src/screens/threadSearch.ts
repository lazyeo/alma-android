import { t } from '../i18n/runtime'
export interface SearchHit {
  id: string
  title: string
  count: number
  snippets: Array<{ rowId?: string; text: string }>
}
export function plainSearchText(text: string) {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]*>/g, '')
    .replace(/(^|\n)\s{0,3}(?:#{1,6}\s|>\s|[-*+]\s)/g, '$1')
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
export function searchSnippet(text: string, query: string, length = 120) {
  const plain = plainSearchText(text)
  const index = plain.toLowerCase().indexOf(query.trim().toLowerCase())
  const start = Math.max(0, index - Math.floor((length - query.length) / 2))
  return `${start ? '…' : ''}${plain.slice(start, start + length)}${start + length < plain.length ? '…' : ''}`
}
export function highlightQuery(text: string, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return [{ text, match: false }]
  const parts: Array<{ text: string; match: boolean }> = []
  let start = 0
  let index = text.toLowerCase().indexOf(needle)
  while (index >= 0) {
    if (index > start)
      parts.push({ text: text.slice(start, index), match: false })
    parts.push({ text: text.slice(index, index + needle.length), match: true })
    start = index + needle.length
    index = text.toLowerCase().indexOf(needle, start)
  }
  if (start < text.length) parts.push({ text: text.slice(start), match: false })
  return parts
}
export function parseThreadSearch(value: unknown, query = ''): SearchHit[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((raw) => {
    if (
      !raw ||
      typeof raw.id !== 'string' ||
      raw.isIncognito ||
      raw.parentThreadId
    )
      return []
    const rows = Array.isArray(raw.matches)
      ? raw.matches
      : Array.isArray(raw.messages)
        ? raw.messages
        : []
    const snippets = rows.flatMap((row: any) => {
      const text =
        typeof row.content === 'string'
          ? row.content
          : Array.isArray(row.message?.parts)
            ? row.message.parts
                .filter((p: any) => p.type === 'text')
                .map((p: any) => p.text || '')
                .join(' ')
            : ''
      return text &&
        (!query ||
          plainSearchText(text).toLowerCase().includes(query.toLowerCase()))
        ? [{ rowId: typeof row.id === 'string' ? row.id : undefined, text }]
        : []
    })
    return [
      {
        id: raw.id,
        title:
          typeof raw.title === 'string'
            ? raw.title
            : t('common.untitledThread'),
        count:
          typeof raw.matchCount === 'number' ? raw.matchCount : snippets.length,
        snippets: snippets.slice(0, 2),
      },
    ]
  })
}
