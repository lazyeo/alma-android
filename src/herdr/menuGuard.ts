import { parseBlockedPrompt } from './model'
import { stripAnsi } from './transcript'

export type OpenMenu = { kind: 'cursor-list' | 'numbered' }

const cursorLine = /^(\s*)[❯›>]\s+(.+)$/
const footer =
  /(?:\b(?:enter|⏎)\b.*\b(?:esc|escape)\b|\b(?:esc|escape)\b.*\b(?:enter|⏎)\b|\b(?:esc|escape)\b\s+to\s+cancel)/i

const contentColumn = (line: string) => {
  const cursor = cursorLine.exec(line)
  if (cursor) return cursor[1].length + 2
  const content = /^(\s*)\S/.exec(line)
  return content ? content[1].length : undefined
}

/** Detects a visible terminal picker without treating the normal input prompt as one. */
export function detectOpenMenu(screenText: string): OpenMenu | null {
  const text = stripAnsi(screenText)
  if (parseBlockedPrompt(text)) return { kind: 'numbered' }

  const lines = text.split(/\r?\n/).slice(-40)
  const nonEmpty = lines.filter((line) => line.trim())
  const tail = nonEmpty.slice(-6)
  const lastLine = nonEmpty.at(-1) ?? ''
  const hasFooter = tail.some((line) => footer.test(line))
  if (hasFooter) return { kind: 'cursor-list' }
  const lastCursorIndex = lines.findLastIndex((line) => line.trim())
  if (lastCursorIndex >= 0 && /^\s*[❯›»>]\s*/.test(lines[lastCursorIndex])) {
    const selected = cursorLine.exec(lines[lastCursorIndex])
    if (!selected) return null
    const selectedColumn = selected[1].length + 2
    let runLength = 1
    for (let index = lastCursorIndex - 1; index >= 0; index -= 1) {
      const column = contentColumn(lines[index])
      if (
        !lines[index].trim() ||
        column === undefined ||
        Math.abs(column - selectedColumn) > 1
      )
        break
      runLength += 1
    }
    if (runLength < 3) return null
  }
  if (/^\s*»\s*Ask\b/i.test(lastLine)) return null

  for (let index = 0; index < lines.length - 1; index += 1) {
    if (cursorLine.test(lines[index]) && cursorLine.test(lines[index + 1]))
      return { kind: 'cursor-list' }
  }

  for (let index = 0; index < lines.length; index += 1) {
    const selected = cursorLine.exec(lines[index])
    if (!selected) continue
    const selectedColumn = selected[1].length + 2
    let start = index
    let end = index
    while (start > 0) {
      const column = contentColumn(lines[start - 1])
      if (
        !lines[start - 1].trim() ||
        column === undefined ||
        Math.abs(column - selectedColumn) > 1
      )
        break
      start -= 1
    }
    while (end < lines.length - 1) {
      const column = contentColumn(lines[end + 1])
      if (
        !lines[end + 1].trim() ||
        column === undefined ||
        Math.abs(column - selectedColumn) > 1
      )
        break
      end += 1
    }
    if (end - start + 1 >= 3) return { kind: 'cursor-list' }
  }

  return null
}
