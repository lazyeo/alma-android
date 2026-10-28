import { useEffect, useId, useState, type ReactNode } from 'react'
import { useT } from '../i18n'

// Serialize initialize/render: Mermaid has process-global configuration.
let renderQueue = Promise.resolve()
export function MermaidPreview({
  source,
  closed,
  children,
}: {
  source: string
  closed: boolean
  children: ReactNode
}) {
  const t = useT()
  const id = useId().replace(/:/g, '')
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  const [showSource, setShowSource] = useState(false)
  const [theme, setTheme] = useState(
    () => document.documentElement.style.colorScheme,
  )
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setTheme(document.documentElement.style.colorScheme),
    )
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['style', 'class', 'data-theme'],
    })
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let cancelled = false
    let objectUrl = ''
    setUrl('')
    setFailed(false)
    if (!closed) return
    const timer = window.setTimeout(() => {
      renderQueue = renderQueue
        .then(async () => {
          if (cancelled) return
          const { default: mermaid } = await import('mermaid')
          if (cancelled) return
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: 'strict',
            theme: theme === 'dark' ? 'dark' : 'default',
            suppressErrorRendering: true,
            flowchart: { htmlLabels: false },
            maxTextSize: 50000,
          })
          const { svg } = await mermaid.render(`diagram-${id}`, source)
          if (cancelled) return
          // An image document cannot run scripts or access the application DOM.
          objectUrl = URL.createObjectURL(
            new Blob([svg], { type: 'image/svg+xml' }),
          )
          setUrl(objectUrl)
        })
        .catch(() => {
          if (!cancelled) setFailed(true)
        })
    }, 350)
    return () => {
      cancelled = true
      clearTimeout(timer)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [source, closed, id, theme])
  return (
    <div className="mermaid-preview">
      {url && (
        <div className="diagram-image">
          <img src={url} alt={t('files.rich.diagram')} />
        </div>
      )}
      {failed && <p role="status">{t('files.rich.diagramFailed')}</p>}
      {url && (
        <button type="button" onClick={() => setShowSource(!showSource)}>
          {t(showSource ? 'files.rich.hideSource' : 'files.rich.showSource')}
        </button>
      )}
      {(!url || showSource) && children}
    </div>
  )
}
