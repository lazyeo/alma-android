import { currentLocale, t } from '../i18n/runtime'
export interface CrystalSummary {
  id: string
  name: string
  stage: string
  type?: string
  dormant: boolean
  slot?: number
  updatedAt?: string
}
export interface CrystalOverview {
  contourCount: number
  slotCapacity: number
  slots: CrystalSummary[]
  backpack: CrystalSummary[]
  formal: CrystalSummary[]
  types: string[]
}
export interface CrystalChecklistItem {
  key: string
  label: string
  complete: boolean
  value?: string
  sources?: string[]
  conflict?: boolean
}
export interface CrystalMaterial {
  id?: string
  kind?: string
  source?: string
  title: string
  secondary?: string
  threadTitle?: string
  uri?: string
  threadId?: string
  anchorId?: string
  createdAt?: string
  unavailable?: boolean
}
export interface CrystalDetail extends CrystalSummary {
  materials: CrystalMaterial[]
  checklist: CrystalChecklistItem[]
  checklistRecognized: boolean
  related: unknown[]
  termStats: Record<string, unknown>
  origin?: string
  validation?: unknown
}
export interface ChecklistEdit {
  value: string
  sources: string[]
  conflict?: boolean
}

const object = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' ? (value as Record<string, any>) : {}
const stringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : undefined
const parseRef = (value: unknown) => {
  if (typeof value !== 'string') return object(value)
  try {
    return object(JSON.parse(value))
  } catch {
    return {}
  }
}
function summary(value: unknown): CrystalSummary {
  const row = object(value)
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? t('library.crystals.untitled')),
    stage: String(row.stage ?? ''),
    ...(typeof row.type === 'string' ? { type: row.type } : {}),
    dormant: row.dormant === true || row.dormant === 1,
    ...(typeof row.slot === 'number' ? { slot: row.slot } : {}),
    ...(typeof row.updatedAt === 'string' || typeof row.updated_at === 'string'
      ? { updatedAt: String(row.updatedAt ?? row.updated_at) }
      : {}),
  }
}
export function parseCrystalOverview(value: unknown): CrystalOverview {
  const input = object(value)
  const rows = (key: string) =>
    Array.isArray(input[key])
      ? input[key].map(summary).filter((item: CrystalSummary) => item.id)
      : []
  return {
    contourCount: Number(input.contourCount) || 0,
    slotCapacity: Number(input.slotCapacity) || 3,
    slots: rows('slots'),
    backpack: rows('backpack'),
    formal: rows('formal'),
    types: stringArray(input.types) ?? [],
  }
}

const materialTitle = (item: Record<string, any>, ref: Record<string, any>) =>
  String(
    item.title ??
      ref.excerpt ??
      ref.text ??
      item.label ??
      item.name ??
      ref.title ??
      item.uri ??
      t('library.crystals.material'),
  )
const materialSecondary = (
  item: Record<string, any>,
  ref: Record<string, any>,
) => {
  const value =
    ref.threadTitle ??
    ref.sourceThreadTitle ??
    item.threadTitle ??
    (item.source && item.source !== 'auto' ? item.source : undefined) ??
    formatMaterialDate(item.createdAt ?? item.created_at)
  return value ? String(value) : undefined
}

function formatMaterialDate(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return date.toLocaleDateString(currentLocale(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function parseCrystalDetail(value: unknown): CrystalDetail {
  const input = object(value)
  const base = summary(input)
  const rawSpec = Array.isArray(input.checklistSpec) ? input.checklistSpec : []
  const checklistValues = object(input.checklist)
  const checklist = rawSpec.map((raw: unknown) => {
    const item =
      typeof raw === 'string' ? { key: raw, label: raw } : object(raw)
    const key = String(item.key ?? item.id ?? item.label ?? 'item')
    const entry = object(checklistValues[key])
    const value = typeof entry.value === 'string' ? entry.value : undefined
    const sources = stringArray(entry.sources)
    return {
      key,
      label: String(item.label ?? key),
      value,
      sources,
      ...(typeof entry.conflict === 'boolean'
        ? { conflict: entry.conflict }
        : {}),
      complete: !!value?.trim() && !!sources?.length,
    }
  })
  return {
    ...base,
    materials: (Array.isArray(input.materials) ? input.materials : []).map(
      (raw: unknown) => {
        const item = object(raw)
        const ref = parseRef(item.ref)
        const threadId =
          typeof ref.threadId === 'string' ? ref.threadId : undefined
        const anchorId =
          typeof ref.anchorId === 'string' ? ref.anchorId : undefined
        const uri =
          typeof item.uri === 'string'
            ? item.uri
            : threadId && anchorId
              ? `alma://thread/${encodeURIComponent(threadId)}/message/${encodeURIComponent(anchorId)}`
              : undefined
        return {
          ...(item.id ? { id: String(item.id) } : {}),
          ...(item.kind ? { kind: String(item.kind) } : {}),
          ...(item.source ? { source: String(item.source) } : {}),
          title: materialTitle(item, ref),
          ...(materialSecondary(item, ref)
            ? { secondary: materialSecondary(item, ref) }
            : {}),
          ...(uri ? { uri } : {}),
          ...(threadId ? { threadId } : {}),
          ...(anchorId ? { anchorId } : {}),
          ...(item.createdAt || item.created_at
            ? { createdAt: String(item.createdAt ?? item.created_at) }
            : {}),
        }
      },
    ),
    checklist,
    checklistRecognized:
      Array.isArray(input.checklistSpec) &&
      !!input.checklist &&
      typeof input.checklist === 'object' &&
      !Array.isArray(input.checklist),
    related: Array.isArray(input.related) ? input.related : [],
    termStats: object(input.termStats),
    validation: input.validation,
    origin: typeof input.origin === 'string' ? input.origin : undefined,
  }
}

export interface MaterialResolution {
  uri: string
  kind?: string
  id?: string
  exists: boolean
  title: string
  subtitle?: string
  summary?: string
}

export function materialUris(materials: CrystalMaterial[]) {
  return [...new Set(materials.flatMap((item) => (item.uri ? [item.uri] : [])))]
}

const resolvedThreadTitle = (subtitle?: string) => {
  if (!subtitle) return undefined
  const match = /^user in [“"](.+)[”"]$/.exec(subtitle)
  return match?.[1] ?? subtitle
}

export function applyMaterialResolutions(
  materials: CrystalMaterial[],
  resolutions: MaterialResolution[],
) {
  const byUri = new Map(resolutions.map((item) => [item.uri, item]))
  return materials.map((material) => {
    if (!material.uri) return material
    const resolved = byUri.get(material.uri)
    if (!resolved) return material
    if (!resolved.exists)
      return {
        ...material,
        title: t('library.crystals.materialUnavailable'),
        secondary: material.createdAt
          ? formatMaterialDate(material.createdAt)
          : undefined,
        unavailable: true,
      }
    const threadTitle = resolvedThreadTitle(resolved.subtitle)
    return {
      ...material,
      title: resolved.summary || resolved.title || material.title,
      threadTitle,
      secondary: [threadTitle, formatMaterialDate(material.createdAt)]
        .filter(Boolean)
        .join('  '),
      unavailable: false,
    }
  })
}

export function checklistSaveBody(field: string, edit: ChecklistEdit) {
  return {
    field,
    value: edit.value,
    sources: [...edit.sources],
    ...(typeof edit.conflict === 'boolean' ? { conflict: edit.conflict } : {}),
  }
}

export function validationMessage(
  value: unknown,
  checklist: Pick<CrystalChecklistItem, 'key' | 'label'>[],
) {
  const result = object(value)
  if (result.ready === true) return ''
  const labels = new Map(checklist.map((item) => [item.key, item.label]))
  labels.set('type', t('library.crystals.actions.type'))
  const sentence = (key: 'missing' | 'conflicted') => {
    const items = stringArray(result[key]) ?? []
    return items.length
      ? t(`library.crystals.actions.${key}`, {
          fields: items
            .map((item) => labels.get(item) ?? item)
            .join(t('library.crystals.actions.listSeparator')),
        })
      : ''
  }
  return [sentence('missing'), sentence('conflicted')].filter(Boolean).join(' ')
}
