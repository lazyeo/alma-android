import {
  createContext,
  memo,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react'
import type { Components } from 'react-markdown'
import { MermaidPreview } from './MermaidPreview'
import { closedFence, guardCurrency } from './richMarkdown'
import Markdown, { defaultUrlTransform, type ExtraProps } from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { CodeBlock } from './CodeBlock'
import { baseRemarkPlugins } from './markdownPlugins'
import remarkUserFilePaths from './remarkUserFilePaths'
import { stripReferenceAtSigns as stripMessageReferenceAtSigns } from './references'
import { getCachedSiteIcon } from './siteIconCache'

const isReferenceUri = (url: string) => /^alma:\/\/(?!connect)[^/]+\//.test(url)
const keepReferenceUrls = (url: string) =>
  isReferenceUri(url) ? url : defaultUrlTransform(url)

type RemarkPlugin = NonNullable<
  ComponentProps<typeof Markdown>['remarkPlugins']
>[number]
type AnchorProps = ComponentProps<'a'> & { node?: unknown }
type ImageProps = ComponentProps<'img'> & { node?: unknown }

const MarkdownSourceContext = createContext('')

const MAX_MARKDOWN_RENDER_CACHE_ENTRIES = 200
const markdownRenderCache = new Map<string, ReactElement>()
const callbackIdentities = new WeakMap<object, number>()
let nextCallbackIdentity = 1

function callbackIdentity(value: object | null | undefined) {
  if (!value) return 0
  let identity = callbackIdentities.get(value)
  if (!identity) {
    identity = nextCallbackIdentity++
    callbackIdentities.set(value, identity)
  }
  return identity
}

function cachedMarkdownRender(key: string, render: () => ReactElement) {
  const cached = markdownRenderCache.get(key)
  if (cached) {
    markdownRenderCache.delete(key)
    markdownRenderCache.set(key, cached)
    return cached
  }
  const rendered = render()
  markdownRenderCache.set(key, rendered)
  if (markdownRenderCache.size > MAX_MARKDOWN_RENDER_CACHE_ENTRIES) {
    markdownRenderCache.delete(markdownRenderCache.keys().next().value!)
  }
  return rendered
}

export function clearMarkdownRenderCache() {
  markdownRenderCache.clear()
}

function externalHttpUrl(href?: string) {
  if (!href) return null
  try {
    const url = new URL(href)
    return url.protocol === 'http:' || url.protocol === 'https:' ? href : null
  } catch {
    return null
  }
}

function MarkdownLink({
  href,
  children,
  renderLink,
  getSiteIcon,
  ...props
}: AnchorProps & {
  renderLink?: (props: AnchorProps) => ReactNode
  getSiteIcon?: (url: string) => Promise<string | null>
}) {
  const externalUrl = externalHttpUrl(href)
  const [icon, setIcon] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    if (!externalUrl || !getSiteIcon) return
    void getCachedSiteIcon(externalUrl, getSiteIcon).then((dataUrl) => {
      if (active) setIcon(dataUrl)
    })
    return () => {
      active = false
    }
  }, [externalUrl, getSiteIcon])

  const content = (
    <>
      {icon ? (
        <img className="markdown-link-favicon" src={icon} alt="" />
      ) : null}
      {children}
    </>
  )
  if (renderLink) return renderLink({ href, children: content, ...props })
  return (
    <a href={href} {...props}>
      {content}
    </a>
  )
}

function MarkdownPre({
  node,
  children,
  ...props
}: ComponentProps<'pre'> & ExtraProps) {
  const markdownSource = useContext(MarkdownSourceContext)
  const code = node?.children[0]
  const isMermaid =
    code?.type === 'element' &&
    Array.isArray(code.properties.className) &&
    code.properties.className.includes('language-mermaid')
  if (!isMermaid)
    return (
      <CodeBlock node={node} {...props}>
        {children}
      </CodeBlock>
    )
  const source = code.children
    .map((child) => (child.type === 'text' ? child.value : ''))
    .join('')
  const raw = markdownSource.slice(
    node?.position?.start.offset,
    node?.position?.end.offset,
  )
  return (
    <MermaidPreview source={source} closed={closedFence(raw)}>
      {(slots) => (
        <CodeBlock node={node} {...props} {...slots}>
          {children}
        </CodeBlock>
      )}
    </MermaidPreview>
  )
}

function MarkdownCode({
  className: codeClassName,
  children,
  node: _node,
  ...props
}: ComponentProps<'code'> & { node?: unknown }) {
  const match = /language-(\w+)/.exec(codeClassName ?? '')
  return match ? (
    <SyntaxHighlighter useInlineStyles={false} language={match[1]} PreTag="div">
      {String(children).replace(/\n$/, '')}
    </SyntaxHighlighter>
  ) : (
    <code className={codeClassName} {...props}>
      {children}
    </code>
  )
}

function MarkdownTable({
  children,
  node: _node,
  ...props
}: ComponentProps<'table'> & { node?: unknown }) {
  return (
    <div className="markdown-table-wrap">
      <table {...props}>{children}</table>
    </div>
  )
}

export const MarkdownContent = memo(function MarkdownContent({
  text,
  linkUserFilePaths = false,
  references = true,
  renderReference,
  renderLink,
  renderImage,
  getSiteIcon,
  components,
  className = '',
  math: renderMath = true,
}: {
  text: string
  linkUserFilePaths?: boolean
  references?: boolean
  renderReference?: (href: string, children: ReactNode) => ReactNode
  renderLink?: (props: AnchorProps) => ReactNode
  renderImage?: (props: ImageProps) => ReactNode
  getSiteIcon?: (url: string) => Promise<string | null>
  components?: ComponentProps<typeof Markdown>['components']
  className?: string
  /** False for text the user typed: "(a)", "\\(x\\)" or "$5" are prose, not formulas. */
  math?: boolean
}) {
  const [loadedMath, setMath] = useState<typeof import('./richMath')>()
  const math = renderMath ? loadedMath : undefined
  // Single dollars stay literal, as on the desktop (chat.singleDollarTextMath
  // defaults to off there), so only $$ and math fences need KaTeX.
  const needsMath = renderMath && /\$\$|```math|~~~math/.test(text)
  useEffect(() => {
    if (needsMath) void import('./richMath').then(setMath)
  }, [needsMath])
  const guarded = guardCurrency(text)
  const remarkPlugins = useMemo(
    () => [
      ...baseRemarkPlugins,
      ...(math
        ? [[math.remarkMath, { singleDollarTextMath: false }] as RemarkPlugin]
        : []),
      ...(references ? [() => stripMessageReferenceAtSigns] : []),
      ...(linkUserFilePaths ? [remarkUserFilePaths] : []),
    ],
    [math, references, linkUserFilePaths],
  )
  const rehypePlugins = useMemo<
    ComponentProps<typeof Markdown>['rehypePlugins']
  >(
    () =>
      math
        ? [[math.rehypeKatex, { trust: false, strict: 'warn' }] as const]
        : [],
    [math],
  )
  const markdownComponents = useMemo(
    (): Components => ({
      ...components,

      a({ href, children, node, ...props }) {
        if (href && isReferenceUri(href) && renderReference)
          return renderReference(href, children)
        return (
          <MarkdownLink
            href={href}
            renderLink={renderLink}
            getSiteIcon={getSiteIcon}
            {...props}
          >
            {children}
          </MarkdownLink>
        )
      },
      img({ node, ...props }) {
        return renderImage ? (
          renderImage({ node, ...props })
        ) : (
          <img {...props} />
        )
      },
      code: MarkdownCode,
      pre: MarkdownPre,
      // Stable identities: an inline component would be a new type on every
      // render, remounting the scroller and resetting horizontal scroll.
      table: MarkdownTable,
    }),
    [components, renderReference, renderLink, renderImage, getSiteIcon],
  )
  const cacheKey = [
    guarded,
    math ? 'math' : 'plain',
    references ? 'references' : 'no-references',
    linkUserFilePaths ? 'file-paths' : 'no-file-paths',
    callbackIdentity(components),
    callbackIdentity(renderReference),
    callbackIdentity(renderLink),
    callbackIdentity(renderImage),
    callbackIdentity(getSiteIcon),
  ].join('\u0000')
  const renderedMarkdown = cachedMarkdownRender(cacheKey, () =>
    Markdown({
      children: guarded,
      remarkPlugins,
      rehypePlugins,
      urlTransform: keepReferenceUrls,
      components: markdownComponents,
    }),
  )
  return (
    <MarkdownSourceContext.Provider value={guarded}>
      <div className={`markdown-content${className ? ` ${className}` : ''}`}>
        {renderedMarkdown}
      </div>
    </MarkdownSourceContext.Provider>
  )
})
