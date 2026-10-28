import { expect, it } from 'vitest'
import { parseCsv } from './csvPreview'
it('parses quoted commas, escaped quotes, embedded newlines, BOM and CRLF', () => {
  expect(
    parseCsv('\uFEFFname,note,empty\r\nAlice,"one, two\n""three""",\r\n'),
  ).toEqual({
    rows: [
      ['name', 'note', 'empty'],
      ['Alice', 'one, two\n"three"', ''],
    ],
    truncated: false,
  })
  expect(parseCsv('')).toEqual({ rows: [], truncated: false })
  expect(parseCsv('a,b\n')).toEqual({ rows: [['a', 'b']], truncated: false })
})
it('caps rows without reporting truncation for an exact fit', () => {
  expect(parseCsv('a\nb\nc', 2)).toEqual({
    rows: [['a'], ['b']],
    truncated: true,
  })
  expect(parseCsv('a\nb\n', 2).truncated).toBe(false)
})
it('reports malformed quoting instead of silently shifting columns', () => {
  expect(() => parseCsv('a,"unfinished')).toThrow()
  expect(() => parseCsv('a,"quoted"junk')).toThrow()
})
it('retains only one overflow column for wide CSV rows', () => {
  const data = parseCsv(
    Array.from({ length: 1000 }, (_, i) => `${i}`).join(','),
  )
  expect(data.rows[0]).toHaveLength(101)
  expect(data.rows[0][100]).toBe('100')
})
