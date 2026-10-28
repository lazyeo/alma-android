import { useT } from '../i18n'
import {
  TABLE_COLUMN_LIMIT,
  TABLE_ROW_LIMIT,
  type TableData,
} from './csvPreview'
export function TablePreview({ data }: { data: TableData }) {
  const t = useT()
  const columns = Math.min(
    TABLE_COLUMN_LIMIT,
    Math.max(0, ...data.rows.map((row) => row.length)),
  )
  const truncatedColumns = data.rows.some(
    (row) => row.length > TABLE_COLUMN_LIMIT,
  )
  if (!data.rows.length) return <p>{t('files.rich.empty')}</p>
  return (
    <div className="table-preview">
      {data.truncated && (
        <p role="status">
          {t('files.rich.rowLimit', { count: TABLE_ROW_LIMIT })}
        </p>
      )}
      {truncatedColumns && (
        <p role="status">
          {t('files.rich.columnLimit', { count: TABLE_COLUMN_LIMIT })}
        </p>
      )}
      <div className="preview-table-scroll">
        <table>
          <thead>
            <tr>
              {Array.from({ length: columns }, (_, column) => (
                <th key={column} scope="col">
                  {data.rows[0][column] ?? ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.slice(1).map((row, index) => (
              <tr key={index}>
                {Array.from({ length: columns }, (_, column) => (
                  <td key={column}>{row[column] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
