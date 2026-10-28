import { ChevronDown, Image, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnchoredMenu } from '../components/AnchoredMenu'
import { useDesktops } from '../desktops/DesktopContext'
import { desktopThreadPath, desktopThreadsPath } from '../desktopRoutes'
import { haptic } from '../haptics'
import { useT } from '../i18n'
import {
  readNativeShareFile,
  reportNativeShareShortcutUsed,
  updateNativeShareShortcuts,
} from '../nativeBridge'
import type { UploadedAttachment } from '../screens/messageParts'
import {
  createNewConversation,
  loadNewConversationDefaults,
} from '../screens/newConversation'
import {
  composeSharedMessage,
  decodeShareShortcutId,
  encodeNewChatShortcutId,
  encodeThreadShortcutId,
  searchSharedThreads,
  type ShareFile,
} from './shareLogic'
import { useSharePayload } from './useSharePayload'
import { recentThreadsByDesktop, useSharedThreads } from './useSharedThreads'

async function uploadSharedFiles(
  files: ShareFile[],
  api: NonNullable<
    ReturnType<typeof useDesktops>['desktops'][number]['connection']
  >['api'],
) {
  const attachments: UploadedAttachment[] = []
  for (const file of files) {
    const bytes = file.dataUrl
      ? new Uint8Array(
          atob(file.dataUrl.split(',').pop() || '')
            .split('')
            .map((character) => character.charCodeAt(0)),
        )
      : await readNativeShareFile(file.path || '')
    if (file.mimeType.startsWith('image/')) {
      const result = await api.uploadImage(bytes, file.mimeType)
      attachments.push({
        kind: 'image',
        name: file.name,
        mediaType: result.mediaType || file.mimeType,
        url: result.url,
        previewUrl: file.dataUrl || file.path,
      })
    } else {
      const result = await api.uploadFile(bytes, file.name, file.mimeType)
      attachments.push({
        kind: 'file',
        name: file.name,
        mediaType: file.mimeType,
        filePath: result.filePath,
      })
    }
  }
  return attachments
}

export function ShareScreen() {
  const t = useT()
  const navigate = useNavigate()
  const { desktops: allDesktops, store } = useDesktops()
  const desktops = useMemo(
    () => allDesktops.filter(({ pairing }) => !pairing.hidden),
    [allDesktops],
  )
  const visibleActiveId = desktops.some(
    ({ pairing }) => pairing.id === store.activeId,
  )
    ? store.activeId
    : undefined
  const { payload, clear } = useSharePayload()
  const { sources, rows, loading } = useSharedThreads()
  const [query, setQuery] = useState('')
  const [selectedKey, setSelectedKey] = useState<string>()
  const [desktopId, setDesktopId] = useState(
    visibleActiveId || desktops[0]?.pairing.id || '',
  )
  const [question, setQuestion] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [desktopMenu, setDesktopMenu] = useState(false)
  const desktopButton = useRef<HTMLButtonElement>(null)
  const target = decodeShareShortcutId(payload?.shortcutId)
  const filtered = useMemo(
    () => searchSharedThreads(rows, query),
    [query, rows],
  )
  const selected = rows.find((row) => row.key === selectedKey)
  const chosenDesktop = desktops.find(
    (desktop) => desktop.pairing.id === (selected?.desktopId || desktopId),
  )

  useEffect(() => {
    if (!target) return
    setDesktopId(target.desktopId)
    if (target.kind === 'thread')
      setSelectedKey(`${target.desktopId}:${target.threadId}`)
  }, [payload?.shortcutId])

  useEffect(() => {
    const shortcuts = [
      ...recentThreadsByDesktop(sources).map(
        ({ desktopId, desktopName, thread }) => ({
          id: encodeThreadShortcutId(desktopId, thread.id),
          label: thread.title || t('common.untitledThread'),
          desktopName,
        }),
      ),
      ...desktops.map(({ pairing }) => ({
        id: encodeNewChatShortcutId(pairing.id),
        label: t('share.newChatShortcut', { desktop: pairing.name }),
        desktopName: pairing.name,
      })),
    ]
    void updateNativeShareShortcuts({
      shortcuts,
      activeDesktopIds: desktops.map(({ pairing }) => pairing.id),
    }).catch(() => undefined)
  }, [desktops, sources, t])

  const close = () => {
    clear()
    const fallback = visibleActiveId || desktops[0]?.pairing.id
    navigate(fallback ? desktopThreadsPath(fallback) : '/pair', {
      replace: true,
    })
  }

  const send = async () => {
    if (
      !payload ||
      !chosenDesktop?.connection ||
      chosenDesktop.status !== 'online'
    ) {
      setError(t('share.chooseOnline'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const api = chosenDesktop.connection.api
      const attachments = await uploadSharedFiles(payload.files, api)
      const content = composeSharedMessage(payload, question)
      const threadId =
        selected?.threadId ||
        (await createNewConversation(
          api,
          await loadNewConversationDefaults(api),
        ))
      await reportNativeShareShortcutUsed(payload.shortcutId)
      clear()
      navigate(desktopThreadPath(chosenDesktop.pairing.id, threadId), {
        replace: true,
        state: {
          pendingFirstSend: {
            id: crypto.randomUUID(),
            content,
            attachments,
            createdAt: Date.now(),
          },
        },
      })
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('share.failed'))
    } finally {
      setBusy(false)
    }
  }

  if (!payload)
    return (
      <main className="share-screen share-empty">
        <p>{t('share.nothingWaiting')}</p>
        <button onClick={close}>{t('share.backToThreads')}</button>
      </main>
    )

  return (
    <main className="share-screen">
      <header className="share-header">
        <button
          className="share-close"
          aria-label={t('share.close')}
          onClick={close}
        >
          <X size={20} />
        </button>
        <h1>{t('share.title')}</h1>
      </header>
      <label className="share-search">
        <Search size={16} />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('share.searchPlaceholder')}
          aria-label={t('share.searchPlaceholder')}
        />
      </label>
      <section className="share-thread-list" aria-label={t('share.recent')}>
        {loading && !rows.length ? (
          <p className="empty">{t('share.loading')}</p>
        ) : null}
        {filtered.map((row) => {
          const offline = row.status !== 'online'
          const selectedRow = selectedKey === row.key
          return (
            <button
              key={row.key}
              className={`share-thread-row${selectedRow ? ' selected' : ''}`}
              aria-pressed={selectedRow}
              disabled={offline}
              onClick={() => {
                void haptic('selection')
                setSelectedKey(selectedRow ? undefined : row.key)
                setDesktopId(row.desktopId)
              }}
            >
              <span className="share-thread-copy">
                <strong>{row.title}</strong>
                <span>{row.desktopName}</span>
                {offline ? (
                  <small>{row.note || t('share.desktopOffline')}</small>
                ) : null}
              </span>
              <span className="share-selection" aria-hidden="true" />
            </button>
          )
        })}
        {!loading && !filtered.length ? (
          <p className="empty">{t('share.noMatches')}</p>
        ) : null}
      </section>
      <footer className="share-composer">
        <div className="share-preview">
          {payload.files.length ? (
            <div className="share-preview-images">
              {payload.files.slice(0, 3).map((file) =>
                file.mimeType.startsWith('image/') ? (
                  <img
                    key={file.path || file.name}
                    src={file.dataUrl || file.path}
                    alt=""
                  />
                ) : (
                  <span key={file.path || file.name}>
                    <Image size={18} />
                    {file.name}
                  </span>
                ),
              )}
            </div>
          ) : null}
          {payload.subject || payload.text ? (
            <p>
              {payload.subject ? <strong>{payload.subject}</strong> : null}
              {payload.text ? <span>{payload.text}</span> : null}
            </p>
          ) : null}
        </div>
        <div className="share-question-row">
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t('share.questionPlaceholder')}
            rows={1}
          />
          <button
            className="share-send"
            disabled={busy}
            onClick={() => void send()}
          >
            {busy ? t('share.sending') : t('common.send')}
          </button>
        </div>
        {!selected ? (
          <>
            <button
              ref={desktopButton}
              className="share-new-chat"
              onClick={() => setDesktopMenu(true)}
            >
              {t('share.newConversationOn', {
                desktop:
                  chosenDesktop?.pairing.name || t('share.desktopFallback'),
              })}
              <ChevronDown size={14} />
            </button>
            <AnchoredMenu
              open={desktopMenu}
              onOpenChange={setDesktopMenu}
              label={t('share.chooseDesktop')}
              anchorRect={desktopButton.current?.getBoundingClientRect()}
              items={desktops.map((desktop) => ({
                key: desktop.pairing.id,
                label: desktop.pairing.name,
                checked: desktop.pairing.id === desktopId,
                disabled: desktop.status !== 'online',
                onSelect: () => setDesktopId(desktop.pairing.id),
              }))}
            />
          </>
        ) : null}
        {error ? <p className="share-error">{error}</p> : null}
      </footer>
    </main>
  )
}
