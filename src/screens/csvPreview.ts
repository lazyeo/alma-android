export const TABLE_ROW_LIMIT = 2000
export const TABLE_COLUMN_LIMIT = 100
export interface TableData {
  rows: string[][]
  truncated: boolean
}
/** RFC 4180 quoting, accepting LF and CRLF. Stops after one extra row. */
export function parseCsv(source: string, limit = TABLE_ROW_LIMIT): TableData {
  const text = source.replace(/^\uFEFF/, '')
  const rows: string[][] = []
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false
  const finishField = () => {
    // Keep one extra column to signal truncation without retaining wide rows.
    if (row.length <= TABLE_COLUMN_LIMIT) row.push(field)
    field = ''
    closed = false
  }
  const finishRow = () => {
    finishField()
    rows.push(row)
    row = []
  }
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          quoted = false
          closed = true
        }
      } else field += c
      continue
    }
    if (c === ',') finishField()
    else if (c === '\n' || c === '\r') {
      finishRow()
      if (c === '\r' && text[i + 1] === '\n') i++
      if (rows.length > limit)
        return { rows: rows.slice(0, limit), truncated: true }
    } else if (c === '"' && !field && !closed) quoted = true
    else {
      if (closed || c === '"') throw new Error('Invalid CSV quoting')
      field += c
    }
  }
  if (quoted) throw new Error('Unclosed CSV quote')
  if (field || closed || row.length) finishRow()
  return { rows: rows.slice(0, limit), truncated: rows.length > limit }
}
