import {
  TABLE_COLUMN_LIMIT,
  TABLE_ROW_LIMIT,
  type TableData,
} from './csvPreview'
export async function loadSpreadsheet(bytes: ArrayBuffer | Uint8Array) {
  const { read, utils } = await import('xlsx')
  const workbook = read(bytes, {
    type: 'array',
    sheetRows: TABLE_ROW_LIMIT + 1,
    cellHTML: false,
    cellFormula: false,
    cellStyles: false,
  })
  return {
    names: workbook.SheetNames,
    sheet(name: string): TableData {
      const sheet = workbook.Sheets[name]
      if (!sheet?.['!ref']) return { rows: [], truncated: false }
      const full = utils.decode_range(sheet['!fullref'] || sheet['!ref'])
      const range = utils.decode_range(sheet['!ref'])
      const truncated = full.e.r - range.s.r + 1 > TABLE_ROW_LIMIT
      range.e.r = Math.min(range.e.r, range.s.r + TABLE_ROW_LIMIT - 1)
      // One extra column lets the table report truncation without allocating huge sparse rows.
      range.e.c = Math.min(range.e.c, range.s.c + TABLE_COLUMN_LIMIT)
      const rows = utils.sheet_to_json<string[]>(sheet, {
        header: 1,
        raw: false,
        defval: '',
        blankrows: true,
        range,
      })
      return { rows, truncated }
    },
  }
}
