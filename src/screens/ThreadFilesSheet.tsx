import { useMemo, useState } from 'react'
import {
  ChevronDown,
  FileText,
  Folder,
  Globe2,
  Image as ImageIcon,
  Search,
} from 'lucide-react'
import { BottomSheet } from '../components/BottomSheet'
import { currentLocale, useT } from '../i18n'
import { openExternalUrl } from '../nativeBridge'
import type { EndResource } from './endResources'
import { endResourceLocation, endResourceSubtitle } from './endResources'
import { useFileLinks } from './FileLinkSheet'
import { useImageGallery } from './ImageGallery'
import { createLineDiff, type DiffLine } from './lineDiff'
import { RelayImage } from './RelayImage'
import {
  classifyFileWrite,
  type ChangedFile,
  type FileWriteEntry,
  type UserAttachment,
} from './threadFiles'

const LIMIT = 8
const COLLAPSED_CONTENT_LINES = 40
const COLLAPSED_DIFF_LINES = 300

function relativeTime(timestamp: string) {
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - Date.parse(timestamp)) / 1000),
  )
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days}d` : `${Math.floor(days / 30)}mo`
}

function absoluteTime(timestamp: string) {
  return new Date(timestamp).toLocaleString(currentLocale(), {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}

function Section({
  id,
  title,
  count,
  children,
}: {
  id: string
  title: string
  count: number
  children: React.ReactNode
}) {
  return (
    <section className="thread-files-section" aria-labelledby={id}>
      <h3 id={id}>
        <span>{title}</span>
        <span>{count}</span>
      </h3>
      {children}
    </section>
  )
}

function ShowAll({
  count,
  expanded,
  onClick,
}: {
  count: number
  expanded: boolean
  onClick(): void
}) {
  const t = useT()
  if (count <= LIMIT) return null
  return (
    <button className="thread-files-show-all" onClick={onClick}>
      <span>
        {expanded
          ? t('files.sheet.showLess')
          : t('files.sheet.showAllCount', { count })}
      </span>
      <ChevronDown className={expanded ? 'expanded' : undefined} size={16} />
    </button>
  )
}

function ResourceRows({
  resources,
  workspacePath,
}: {
  resources: readonly EndResource[]
  workspacePath?: string
}) {
  const { openFile } = useFileLinks()
  return (
    <div className="thread-files-list">
      {resources.map((resource) => {
        const target =
          resource.type === 'file' ? resource.path : resource.target
        const title =
          resource.type === 'file'
            ? resource.path.split(/[\\/]/).pop() || resource.path
            : resource.title || new URL(resource.target).hostname
        const subtitle =
          resource.description ||
          (resource.type === 'file'
            ? endResourceSubtitle(resource.path)
            : resource.target)
        return (
          <button
            className="end-resource-card compact"
            key={`${resource.type}:${target}`}
            onClick={() =>
              resource.type === 'file'
                ? openFile(resource.path)
                : void openExternalUrl(resource.target)
            }
          >
            <span className="end-resource-icon">
              {resource.type === 'file' ? <FileText /> : <Globe2 />}
            </span>
            <span className="end-resource-copy">
              <strong>{title}</strong>
              <span>{subtitle}</span>
            </span>
            {resource.type === 'file' ? (
              <span className="end-resource-location">
                <Folder />
                {endResourceLocation(resource.path, workspacePath)}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}

function ChangedFileRows({
  files,
  onSelect,
}: {
  files: readonly ChangedFile[]
  onSelect(file: ChangedFile): void
}) {
  const t = useT()
  const groups = useMemo(() => {
    const grouped = new Map<string, ChangedFile[]>()
    for (const file of files) {
      const group = grouped.get(file.directory) ?? []
      group.push(file)
      grouped.set(file.directory, group)
    }
    return [...grouped]
  }, [files])
  return (
    <div className="thread-files-groups">
      {groups.map(([directory, entries]) => (
        <div className="thread-files-group" key={directory}>
          <div className="thread-files-directory">
            <Folder size={14} />
            <span>{directory}</span>
          </div>
          {entries.map((file) => (
            <button
              className="thread-files-row"
              key={file.filePath}
              title={file.filePath}
              onClick={() => onSelect(file)}
            >
              <FileText size={16} />
              <span className="thread-files-row-copy">
                <strong>{file.relativePath.split('/').pop()}</strong>
                <small>{file.relativePath}</small>
              </span>
              <span className="thread-files-row-meta">
                <span className="thread-files-row-stats">
                  <span>{relativeTime(file.lastTimestamp)}</span>
                  <span>
                    +{file.additions} −{file.deletions}
                  </span>
                </span>
                <span>
                  {[
                    file.writes
                      ? t('files.sheet.writes', { count: file.writes })
                      : '',
                    file.edits
                      ? t('files.sheet.edits', { count: file.edits })
                      : '',
                  ]
                    .filter(Boolean)
                    .join(t('files.sheet.statsSeparator'))}
                </span>
                {file.viaSubagent ? (
                  <span>{t('files.sheet.viaSubagent')}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ))}
    </div>
  )
}

function AttachmentRows({
  attachments,
}: {
  attachments: readonly UserAttachment[]
}) {
  const { openFile } = useFileLinks()
  const { openGallery } = useImageGallery()
  return (
    <div className="thread-attachment-grid">
      {attachments.map((attachment) =>
        attachment.kind === 'image' ? (
          <div className="thread-attachment-card" key={attachment.source}>
            <span className="thread-attachment-preview">
              <RelayImage source={attachment.source} name={attachment.name} />
            </span>
            <button
              className="thread-attachment-name"
              onClick={() => openGallery(attachment.source)}
            >
              <ImageIcon size={14} />
              <span>{attachment.name}</span>
            </button>
          </div>
        ) : (
          <button
            className="thread-attachment-card"
            key={attachment.source}
            onClick={() => openFile(attachment.source)}
          >
            <span className="thread-attachment-preview">
              <FileText size={20} />
            </span>
            <span className="thread-attachment-name">
              <span>{attachment.name}</span>
            </span>
          </button>
        ),
      )}
    </div>
  )
}

function EntryDiff({ entry }: { entry: FileWriteEntry }) {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  const noPrevious =
    entry.type === 'write' && entry.previousContent === undefined
  const diff = useMemo(
    () =>
      noPrevious
        ? undefined
        : createLineDiff(
            entry.type === 'edit'
              ? entry.oldString
              : (entry.previousContent ?? ''),
            entry.type === 'edit' ? entry.newString : entry.content,
          ),
    [entry, noPrevious],
  )
  const lines = useMemo<Array<DiffLine | { kind: 'header'; text: string }>>(
    () =>
      noPrevious
        ? entry.content
            .replace(/\r\n/g, '\n')
            .split('\n')
            .map((text) => ({
              kind: 'add' as const,
              text,
            }))
        : (diff?.hunks.flatMap((hunk) => [
            {
              kind: 'header' as const,
              text: `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@`,
            },
            ...hunk.lines,
          ]) ?? []),
    [diff, entry, noPrevious],
  )
  const limit = noPrevious ? COLLAPSED_CONTENT_LINES : COLLAPSED_DIFF_LINES
  const visible = expanded ? lines : lines.slice(0, limit)
  return (
    <>
      <pre className="file-diff">
        {visible.map((line, index) =>
          line.kind === 'header' ? (
            <span className="file-diff-hunk" key={`${index}:${line.text}`}>
              {line.text}
            </span>
          ) : (
            <span
              className={`file-diff-line ${line.kind}`}
              key={`${index}:${line.text}`}
            >
              <span aria-hidden="true">
                {line.kind === 'add' ? '+' : line.kind === 'delete' ? '−' : ' '}
              </span>
              <code>{line.text || ' '}</code>
            </span>
          ),
        )}
      </pre>
      {lines.length > limit ? (
        <button
          className="file-diff-show-all"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? t('files.sheet.showLess') : t('files.sheet.showAll')}
        </button>
      ) : null}
    </>
  )
}

function FileChangesView({
  file,
  entries,
  onBack,
}: {
  file: ChangedFile
  entries: readonly FileWriteEntry[]
  onBack(): void
}) {
  const t = useT()
  const { openFile } = useFileLinks()
  const ordered = useMemo(
    () => [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
    [entries],
  )
  return (
    <BottomSheet
      title={file.relativePath.split('/').pop() || file.relativePath}
      label={t('files.sheet.changesFor', { path: file.relativePath })}
      className="file-changes-sheet"
      onBack={onBack}
      onClose={onBack}
    >
      <div className="file-changes-heading">
        <span>{file.relativePath}</span>
        <button onClick={() => openFile(file.filePath)}>
          {t('files.sheet.openFile')}
        </button>
      </div>
      <div className="file-change-list">
        {ordered.map((entry) => (
          <article className="file-change-entry" key={entry.toolCallId}>
            <header>
              <span className="file-change-badge">
                {classifyFileWrite(entry)}
              </span>
              {entry.messageId.includes('--subagent-') ? (
                <span>{t('files.sheet.viaSubagent')}</span>
              ) : null}
              <time dateTime={entry.timestamp}>
                <strong>{relativeTime(entry.timestamp)}</strong>
                <span>{absoluteTime(entry.timestamp)}</span>
              </time>
            </header>
            <EntryDiff entry={entry} />
          </article>
        ))}
      </div>
    </BottomSheet>
  )
}

export function ThreadFilesSheet({
  delivered,
  changedFiles,
  fileWrites,
  attachments,
  changedStatus,
  workspacePath,
  onClose,
}: {
  delivered: readonly EndResource[]
  changedFiles: readonly ChangedFile[]
  fileWrites: readonly FileWriteEntry[]
  attachments: readonly UserAttachment[]
  changedStatus: 'loading' | 'ready' | 'error'
  workspacePath?: string
  onClose(): void
}) {
  const t = useT()
  const [deliveredExpanded, setDeliveredExpanded] = useState(false)
  const [changedExpanded, setChangedExpanded] = useState(false)
  const [attachmentsExpanded, setAttachmentsExpanded] = useState(false)
  const [filter, setFilter] = useState('')
  const [selectedFile, setSelectedFile] = useState<ChangedFile>()
  const filteredFiles = useMemo(() => {
    const query = filter.trim().toLowerCase()
    return query
      ? changedFiles.filter((file) =>
          file.relativePath.toLowerCase().includes(query),
        )
      : changedFiles
  }, [changedFiles, filter])
  const visibleDelivered = deliveredExpanded
    ? delivered
    : delivered.slice(0, LIMIT)
  const visibleChanged = changedExpanded
    ? filteredFiles
    : filteredFiles.slice(0, LIMIT)
  const visibleAttachments = attachmentsExpanded
    ? attachments
    : attachments.slice(0, LIMIT)

  if (selectedFile)
    return (
      <FileChangesView
        file={selectedFile}
        entries={fileWrites.filter(
          (entry) => entry.filePath === selectedFile.filePath,
        )}
        onBack={() => setSelectedFile(undefined)}
      />
    )

  return (
    <BottomSheet
      title={t('files.sheet.title')}
      titleMeta={<span>{delivered.length + changedFiles.length}</span>}
      className="thread-files-sheet"
      onClose={onClose}
    >
      <Section
        id="delivered-files-heading"
        title={t('files.sheet.delivered')}
        count={delivered.length}
      >
        {delivered.length ? (
          <ResourceRows
            resources={visibleDelivered}
            workspacePath={workspacePath}
          />
        ) : (
          <p className="thread-files-empty">{t('files.sheet.noDelivered')}</p>
        )}
        <ShowAll
          count={delivered.length}
          expanded={deliveredExpanded}
          onClick={() => setDeliveredExpanded((value) => !value)}
        />
      </Section>

      <Section
        id="changed-files-heading"
        title={t('files.sheet.changed')}
        count={changedFiles.length}
      >
        {changedFiles.length > 12 ? (
          <label className="thread-files-filter">
            <Search size={16} />
            <input
              aria-label={t('files.sheet.filterLabel')}
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={t('files.sheet.filterPlaceholder')}
            />
          </label>
        ) : null}
        {changedStatus === 'loading' ? (
          <p className="thread-files-empty" role="status">
            {t('files.sheet.loadingChanged')}
          </p>
        ) : changedStatus === 'error' ? (
          <p className="thread-files-error">
            {t('files.sheet.changedUnavailable')}
          </p>
        ) : visibleChanged.length ? (
          <ChangedFileRows files={visibleChanged} onSelect={setSelectedFile} />
        ) : (
          <p className="thread-files-empty">
            {filter
              ? t('files.sheet.noFilterMatch')
              : t('files.sheet.noChanged')}
          </p>
        )}
        <ShowAll
          count={filteredFiles.length}
          expanded={changedExpanded}
          onClick={() => setChangedExpanded((value) => !value)}
        />
      </Section>

      <Section
        id="attachment-files-heading"
        title={t('files.sheet.attachments')}
        count={attachments.length}
      >
        {attachments.length ? (
          <AttachmentRows attachments={visibleAttachments} />
        ) : (
          <p className="thread-files-empty">{t('files.sheet.noAttachments')}</p>
        )}
        <ShowAll
          count={attachments.length}
          expanded={attachmentsExpanded}
          onClick={() => setAttachmentsExpanded((value) => !value)}
        />
      </Section>
    </BottomSheet>
  )
}
