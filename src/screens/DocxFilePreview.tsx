import { useEffect, useState } from 'react'
import { useT } from '../i18n'
import { docxPreviewHtml } from './docxPreview'
import type { DesktopFile } from './localFiles'
export default function DocxFilePreview({ file }: { file: DesktopFile }) {
  const t = useT()
  const [html, setHtml] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    setHtml('')
    setFailed(false)
    void import('docx-preview')
      .then(async ({ renderAsync }) => {
        if (cancelled) return
        const isolated = document.implementation.createHTMLDocument('')
        const body = isolated.createElement('div')
        const styles = isolated.createElement('div')
        await renderAsync(file.bytes, body, styles, {
          useBase64URL: true,
          renderAltChunks: false,
          ignoreWidth: true,
          breakPages: true,
        })
        if (cancelled) return
        setHtml(docxPreviewHtml(body, styles))
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [file])
  if (failed) return <p role="status">{t('files.rich.failed')}</p>
  if (!html) return <p role="status">{t('files.link.loading')}</p>
  return (
    <iframe
      className="docx-preview"
      title={t('files.rich.document')}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={html}
    />
  )
}
