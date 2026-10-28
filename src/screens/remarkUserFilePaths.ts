export interface MarkdownNode {
  type: string
  value?: string
  url?: string
  children?: MarkdownNode[]
  data?: { hProperties?: Record<string, unknown> }
  [key: string]: unknown
}

export const ABSOLUTE_PATH_RE =
  /(?<![A-Za-z0-9])[A-Za-z]:[\\/](?![\\/])[^\s<>"'|?*`，。；！？）】」』、]+|(?<![\w/.:\\])\/[^\s<>"'`，。；！？）】」』、]+/g

const TRAILING_PUNCTUATION_RE = /[.,;:!?)\]}，。；：！？）】」』、]+$/
const KNOWN_ROOT_RE =
  /^(?:[A-Za-z]:[\\/](?:Users|home|tmp|Volumes|private|opt)[\\/]|\/(?:Users|home|tmp|Volumes|private|opt)\/)/

const looksLikeFilePath = (path: string) => {
  if (!/[\\/][^\\/]+[\\/]/.test(path)) return false
  const lastSegment = path.split(/[\\/]/).pop() ?? ''
  return (
    /\.[A-Za-z0-9][A-Za-z0-9._-]*$/.test(lastSegment) ||
    KNOWN_ROOT_RE.test(path)
  )
}

const pathLink = (path: string, child: MarkdownNode): MarkdownNode => ({
  type: 'link',
  url: path,
  children: [child],
})

function linkedText(value: string) {
  const children: MarkdownNode[] = []
  let cursor = 0
  ABSOLUTE_PATH_RE.lastIndex = 0
  for (const match of value.matchAll(ABSOLUTE_PATH_RE)) {
    const raw = match[0]
    const start = match.index ?? 0
    const path = raw.replace(TRAILING_PUNCTUATION_RE, '')
    if (!path || !looksLikeFilePath(path)) continue
    if (start > cursor)
      children.push({ type: 'text', value: value.slice(cursor, start) })
    children.push(pathLink(path, { type: 'text', value: path }))
    cursor = start + path.length
  }
  if (!children.length) return undefined
  if (cursor < value.length)
    children.push({ type: 'text', value: value.slice(cursor) })
  return children
}

export function transformUserFilePaths(node: MarkdownNode) {
  if (!node.children || node.type === 'link' || node.type === 'code') return
  const next: MarkdownNode[] = []
  for (const child of node.children) {
    if (child.type === 'text' && typeof child.value === 'string') {
      next.push(...(linkedText(child.value) ?? [child]))
      continue
    }
    if (child.type === 'inlineCode' && typeof child.value === 'string') {
      const path = child.value.trim()
      if (path === child.value && looksLikeFilePath(path) && isAbsolute(path)) {
        next.push({
          ...pathLink(path, child),
          data: { hProperties: { className: ['markdown-file-path'] } },
        })
        continue
      }
    }
    transformUserFilePaths(child)
    next.push(child)
  }
  node.children = next
}

const isAbsolute = (path: string) =>
  path.startsWith('/') || /^[A-Za-z]:[\\/](?![\\/])/.test(path)

export default function remarkUserFilePaths() {
  return (tree: MarkdownNode) => transformUserFilePaths(tree)
}
