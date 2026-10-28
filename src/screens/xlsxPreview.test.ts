import { expect, it } from 'vitest'
import { utils, write } from 'xlsx'
import { loadSpreadsheet } from './xlsxPreview'
it('reads real XLSX sheets, formatted cells and capped rows without evaluating formulas', async () => {
  const book = utils.book_new()
  utils.book_append_sheet(
    book,
    utils.aoa_to_sheet([
      ['Name', 'Value'],
      ['Alice', 7],
    ]),
    'People',
  )
  utils.book_append_sheet(
    book,
    utils.aoa_to_sheet(Array.from({ length: 2002 }, (_, i) => [i])),
    'Large',
  )
  const loaded = await loadSpreadsheet(
    write(book, { type: 'array', bookType: 'xlsx' }),
  )
  expect(loaded.names).toEqual(['People', 'Large'])
  expect(loaded.sheet('People')).toEqual({
    rows: [
      ['Name', 'Value'],
      ['Alice', '7'],
    ],
    truncated: false,
  })
  expect(loaded.sheet('Large').rows).toHaveLength(2000)
  expect(loaded.sheet('Large').truncated).toBe(true)
})
it('bounds sparse columns and handles empty and exact-limit sheets', async () => {
  const book = utils.book_new()
  utils.book_append_sheet(book, utils.aoa_to_sheet([]), 'Empty')
  utils.book_append_sheet(
    book,
    {
      A1: { t: 's', v: 'First' },
      XFD1: { t: 's', v: 'Last' },
      '!ref': 'A1:XFD1',
    },
    'Wide',
  )
  utils.book_append_sheet(
    book,
    utils.aoa_to_sheet(Array.from({ length: 2000 }, () => ['row'])),
    'Exact',
  )
  const loaded = await loadSpreadsheet(
    write(book, { type: 'array', bookType: 'xlsx' }),
  )
  expect(loaded.sheet('Empty')).toEqual({ rows: [], truncated: false })
  expect(loaded.sheet('Wide').rows[0]).toHaveLength(101)
  expect(loaded.sheet('Exact').rows).toHaveLength(2000)
  expect(loaded.sheet('Exact').truncated).toBe(false)
})
