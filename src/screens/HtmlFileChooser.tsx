import { useCallback, useEffect, useState } from 'react'
import { FileCode2 } from 'lucide-react'
import { BottomSheet } from '../components/BottomSheet'
import { useConnection } from '../desktops/DesktopContext'
import { useT } from '../i18n'
import { isUnsupportedEndpoint } from '../relay/almaApi'
import { useFileLinks } from './FileLinkSheet'
import { parseHtmlFileList, type HtmlPreviewFile } from './htmlPreview'

interface HtmlFileChooserProps {
  workspaceId: string
  onClose: () => void
}

type ChooserState =
  | { status: 'loading' }
  | { status: 'ready'; files: HtmlPreviewFile[] }
  | { status: 'unsupported' }
  | { status: 'error' }

export function HtmlFileChooser({
  workspaceId,
  onClose,
}: HtmlFileChooserProps) {
  const t = useT()
  const { api } = useConnection()
  const { openFile } = useFileLinks()
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<ChooserState>({ status: 'loading' })

  useEffect(() => {
    let active = true
    setState({ status: 'loading' })
    Promise.all([api.listPreviewHtmlFiles(workspaceId), api.listWorkspaces()])
      .then(([response, workspaces]) => {
        const workspacePath = workspaces.find(
          (workspace) => workspace.id === workspaceId,
        )?.path
        if (!workspacePath) throw new Error('Workspace path unavailable')
        if (active)
          setState({
            status: 'ready',
            files: parseHtmlFileList(response, workspacePath),
          })
      })
      .catch((error) => {
        if (!active) return
        setState({
          status: isUnsupportedEndpoint(error) ? 'unsupported' : 'error',
        })
      })
    return () => {
      active = false
    }
  }, [api, attempt, workspaceId])

  const retry = useCallback(() => setAttempt((value) => value + 1), [])

  return (
    <BottomSheet
      title={t('files.htmlChooser.title')}
      label={t('files.htmlChooser.title')}
      className="html-file-chooser"
      onClose={onClose}
    >
      {state.status === 'loading' ? (
        <div className="file-link-state" aria-live="polite">
          <span className="file-link-spinner" />
          <strong>{t('files.htmlChooser.finding')}</strong>
        </div>
      ) : null}
      {state.status === 'unsupported' ? (
        <div className="file-link-state error" aria-live="polite">
          <strong>{t('files.htmlChooser.unsupported')}</strong>
          <span>{t('files.htmlChooser.unsupportedDetail')}</span>
        </div>
      ) : null}
      {state.status === 'error' ? (
        <div className="file-link-state error" aria-live="polite">
          <strong>{t('files.htmlChooser.failed')}</strong>
          <button type="button" onClick={retry}>
            {t('common.tryAgain')}
          </button>
        </div>
      ) : null}
      {state.status === 'ready' && state.files.length === 0 ? (
        <div className="file-link-state" aria-live="polite">
          <strong>{t('files.htmlChooser.empty')}</strong>
          <span>{t('files.htmlChooser.emptyDetail')}</span>
        </div>
      ) : null}
      {state.status === 'ready' && state.files.length ? (
        <div className="sheet-list">
          {state.files.map((file) => (
            <button
              className="sheet-row"
              type="button"
              key={file.relativePath}
              aria-label={file.relativePath}
              onClick={() => {
                openFile(file.path)
                onClose()
              }}
            >
              <FileCode2 size={18} strokeWidth={1.8} aria-hidden="true" />
              <span className="sheet-row-copy">
                <span>{file.name}</span>
                <small>{file.relativePath}</small>
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </BottomSheet>
  )
}
