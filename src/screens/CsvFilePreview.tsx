import { useMemo } from 'react'
import { useT } from '../i18n'
import { parseCsv } from './csvPreview'
import { TablePreview } from './TablePreview'
import type { DesktopFile } from './localFiles'
export default function CsvFilePreview({ file }: { file: DesktopFile }) {
  const t = useT()
  const data = useMemo(() => {
    try {
      return parseCsv(new TextDecoder().decode(file.bytes))
    } catch {
      return undefined
    }
  }, [file])
  return data ? (
    <TablePreview data={data} />
  ) : (
    <p role="status">{t('files.rich.failed')}</p>
  )
}
