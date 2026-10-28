import { useEffect, useId, useState } from 'react'
import { useT } from '../i18n'
import { loadSpreadsheet } from './xlsxPreview'
import { TablePreview } from './TablePreview'
import type { DesktopFile } from './localFiles'
export default function XlsxFilePreview({ file }: { file: DesktopFile }) {
  const t = useT()
  const id = useId()
  const [book, setBook] =
    useState<Awaited<ReturnType<typeof loadSpreadsheet>>>()
  const [selected, setSelected] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    setBook(undefined)
    setFailed(false)
    void loadSpreadsheet(file.bytes)
      .then((value) => {
        if (!cancelled) {
          setBook(value)
          setSelected(value.names[0] ?? '')
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [file])
  if (failed) return <p role="status">{t('files.rich.failed')}</p>
  if (!book) return <p role="status">{t('files.link.loading')}</p>
  return (
    <div className="spreadsheet-preview">
      <div
        className="sheet-tabs"
        role="tablist"
        aria-label={t('files.rich.sheets')}
      >
        {book.names.map((name, index) => (
          <button
            key={name}
            type="button"
            role="tab"
            id={`${id}-tab-${index}`}
            aria-controls={`${id}-panel`}
            tabIndex={selected === name ? 0 : -1}
            onKeyDown={(event) => {
              const next =
                event.key === 'ArrowRight'
                  ? (index + 1) % book.names.length
                  : event.key === 'ArrowLeft'
                    ? (index + book.names.length - 1) % book.names.length
                    : event.key === 'Home'
                      ? 0
                      : event.key === 'End'
                        ? book.names.length - 1
                        : undefined
              if (next === undefined) return
              event.preventDefault()
              setSelected(book.names[next])
              document.getElementById(`${id}-tab-${next}`)?.focus()
            }}
            aria-selected={selected === name}
            onClick={() => setSelected(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={
          selected ? `${id}-tab-${book.names.indexOf(selected)}` : undefined
        }
      >
        <TablePreview data={book.sheet(selected)} />
      </div>
    </div>
  )
}
