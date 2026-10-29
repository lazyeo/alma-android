import {
  Archive,
  Clock,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Folder,
  Globe2,
  Network,
} from 'lucide-react'
import { presenceClass, usePresence } from '../components/usePresence'
import {
  endResourceCategory,
  endResourceLocation,
  endResourceSubtitle,
  type EndResource,
} from '../screens/endResources'
import { fileName } from './fileName'
import { useT } from '../i18n'

function resourceIcon(resource: EndResource) {
  if (resource.type === 'website') return <Globe2 aria-hidden="true" />
  const category = endResourceCategory(resource.path)
  if (category === 'image') return <FileImage aria-hidden="true" />
  if (category === 'spreadsheet') return <FileSpreadsheet aria-hidden="true" />
  if (category === 'archive') return <FileArchive aria-hidden="true" />
  return <FileText aria-hidden="true" />
}

export function EndResourceCards({
  resources,
  workspacePath,
  onOpenFile,
  onOpenWebsite,
}: {
  resources: EndResource[]
  workspacePath?: string
  onOpenFile?: (path: string) => void
  onOpenWebsite?: (target: string) => void
}) {
  const t = useT()
  const visibleResources = resources.filter((resource) =>
    resource.type === 'file' ? Boolean(onOpenFile) : Boolean(onOpenWebsite),
  )
  const presence = usePresence(visibleResources.length > 0)
  if (!presence.rendered) return null
  return (
    <div
      className={`end-resource-grid ${presenceClass(presence.phase)}`}
      aria-label={t('message.resources.label')}
    >
      {visibleResources.map((resource) => {
        const key = resource.type === 'file' ? resource.path : resource.target
        const title =
          resource.type === 'file'
            ? fileName(resource.path)
            : resource.title || new URL(resource.target).hostname
        const subtitle =
          resource.description ||
          (resource.type === 'file'
            ? endResourceSubtitle(resource.path)
            : resource.target)
        const location =
          resource.type === 'file'
            ? endResourceLocation(resource.path, workspacePath)
            : undefined
        return (
          <button
            className="end-resource-card"
            key={key}
            onClick={() =>
              resource.type === 'file'
                ? onOpenFile?.(resource.path)
                : onOpenWebsite?.(resource.target)
            }
          >
            <span className="end-resource-icon">{resourceIcon(resource)}</span>
            <span className="end-resource-copy">
              <strong>{title}</strong>
              <span>{subtitle}</span>
            </span>
            {location ? (
              <span className={`end-resource-location ${location}`}>
                {location === 'temp' ? (
                  <Clock aria-hidden="true" />
                ) : location === 'project' ? (
                  <Folder aria-hidden="true" />
                ) : location === 'global' ? (
                  <Archive aria-hidden="true" />
                ) : (
                  <Network aria-hidden="true" />
                )}
                {t(`message.resources.location.${location}`)}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
