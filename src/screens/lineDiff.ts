export type DiffLineKind = 'context' | 'add' | 'delete'

export interface DiffLine {
  kind: DiffLineKind
  text: string
}

export interface DiffHunk {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
  lines: DiffLine[]
}

export interface LineDiff {
  hunks: DiffHunk[]
  fallback: boolean
}

const CONTEXT_LINES = 3
const MAX_MATRIX_CELLS = 4_000_000

const linesOf = (text: string) =>
  text === ''
    ? []
    : text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')

function wholeBlock(oldLines: string[], newLines: string[]): LineDiff {
  if (!oldLines.length && !newLines.length) return { hunks: [], fallback: true }
  return {
    fallback: true,
    hunks: [
      {
        oldStart: oldLines.length ? 1 : 0,
        oldCount: oldLines.length,
        newStart: newLines.length ? 1 : 0,
        newCount: newLines.length,
        lines: [
          ...oldLines.map((text): DiffLine => ({ kind: 'delete', text })),
          ...newLines.map((text): DiffLine => ({ kind: 'add', text })),
        ],
      },
    ],
  }
}

function operations(oldLines: string[], newLines: string[]): DiffLine[] {
  const width = newLines.length + 1
  const matrix = new Uint32Array((oldLines.length + 1) * width)
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      const cell = oldIndex * width + newIndex
      matrix[cell] =
        oldLines[oldIndex] === newLines[newIndex]
          ? matrix[(oldIndex + 1) * width + newIndex + 1] + 1
          : Math.max(
              matrix[(oldIndex + 1) * width + newIndex],
              matrix[oldIndex * width + newIndex + 1],
            )
    }
  }

  const result: DiffLine[] = []
  let oldIndex = 0
  let newIndex = 0
  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (
      oldIndex < oldLines.length &&
      newIndex < newLines.length &&
      oldLines[oldIndex] === newLines[newIndex]
    ) {
      result.push({ kind: 'context', text: oldLines[oldIndex] })
      oldIndex += 1
      newIndex += 1
    } else if (
      newIndex < newLines.length &&
      (oldIndex === oldLines.length ||
        matrix[oldIndex * width + newIndex + 1] >
          matrix[(oldIndex + 1) * width + newIndex])
    ) {
      result.push({ kind: 'add', text: newLines[newIndex] })
      newIndex += 1
    } else {
      result.push({ kind: 'delete', text: oldLines[oldIndex] })
      oldIndex += 1
    }
  }
  return result
}

function buildHunk(lines: DiffLine[], start: number, end: number): DiffHunk {
  let oldStart = 1
  let newStart = 1
  for (const line of lines.slice(0, start)) {
    if (line.kind !== 'add') oldStart += 1
    if (line.kind !== 'delete') newStart += 1
  }
  const selected = lines.slice(start, end + 1)
  const oldCount = selected.filter((line) => line.kind !== 'add').length
  const newCount = selected.filter((line) => line.kind !== 'delete').length
  return {
    oldStart: oldCount ? oldStart : 0,
    oldCount,
    newStart: newCount ? newStart : 0,
    newCount,
    lines: selected,
  }
}

export function createLineDiff(oldText: string, newText: string): LineDiff {
  const oldLines = linesOf(oldText)
  const newLines = linesOf(newText)
  if (
    oldLines.length === newLines.length &&
    oldLines.every((line, index) => line === newLines[index])
  )
    return { hunks: [], fallback: false }
  if (oldLines.length * newLines.length > MAX_MATRIX_CELLS)
    return wholeBlock(oldLines, newLines)

  const diffLines = operations(oldLines, newLines)
  const changed = diffLines.flatMap((line, index) =>
    line.kind === 'context' ? [] : [index],
  )
  if (!changed.length) return { hunks: [], fallback: false }

  const ranges: Array<[number, number]> = []
  for (const index of changed) {
    const start = Math.max(0, index - CONTEXT_LINES)
    const end = Math.min(diffLines.length - 1, index + CONTEXT_LINES)
    const previous = ranges.at(-1)
    if (previous && start <= previous[1] + 1)
      previous[1] = Math.max(previous[1], end)
    else ranges.push([start, end])
  }
  return {
    fallback: false,
    hunks: ranges.map(([start, end]) => buildHunk(diffLines, start, end)),
  }
}
