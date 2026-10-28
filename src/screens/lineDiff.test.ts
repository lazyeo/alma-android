import { describe, expect, it } from 'vitest'
import { createLineDiff } from './lineDiff'

const changes = (oldText: string, newText: string) =>
  createLineDiff(oldText, newText).hunks.flatMap((hunk) =>
    hunk.lines.map((line) => `${line.kind}:${line.text}`),
  )

describe('line diff', () => {
  it('handles insertions, deletions, replacements and identical text', () => {
    expect(changes('a\nc', 'a\nb\nc')).toEqual([
      'context:a',
      'add:b',
      'context:c',
    ])
    expect(changes('a\nb\nc', 'a\nc')).toEqual([
      'context:a',
      'delete:b',
      'context:c',
    ])
    expect(changes('old', 'new')).toEqual(['delete:old', 'add:new'])
    expect(createLineDiff('same', 'same').hunks).toEqual([])
  })

  it('handles empty text, trailing newlines and CRLF', () => {
    expect(changes('', 'line')).toEqual(['add:line'])
    expect(changes('line', '')).toEqual(['delete:line'])
    expect(changes('a\r\nb\r\n', 'a\nb\n')).toEqual([])
    expect(changes('a\n', 'a')).toEqual(['context:a', 'delete:'])
  })

  it('uses three context lines and merges nearby changes', () => {
    const oldText = Array.from(
      { length: 14 },
      (_, index) => `line ${index + 1}`,
    )
    const next = [...oldText]
    next[3] = 'changed 4'
    next[9] = 'changed 10'
    const result = createLineDiff(oldText.join('\n'), next.join('\n'))
    expect(result.hunks).toHaveLength(1)
    expect(result.hunks[0]).toMatchObject({ oldStart: 1, newStart: 1 })
    expect(result.hunks[0].lines.at(-1)?.text).toBe('line 13')
  })

  it('falls back to whole blocks when the matrix would be too large', () => {
    const oldText = Array.from({ length: 2001 }, () => 'old').join('\n')
    const newText = Array.from({ length: 2001 }, () => 'new').join('\n')
    const result = createLineDiff(oldText, newText)
    expect(result.fallback).toBe(true)
    expect(result.hunks[0].lines[0]).toEqual({ kind: 'delete', text: 'old' })
    expect(result.hunks[0].lines[2001]).toEqual({ kind: 'add', text: 'new' })
  })
})
