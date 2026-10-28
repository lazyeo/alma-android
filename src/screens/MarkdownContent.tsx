import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { MermaidPreview } from './MermaidPreview'
import { closedFence, guardCurrency } from './richMarkdown'
import Markdown, { defaultUrlTransform, type ExtraProps } from 'react-markdown'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { CodeBlock } from './CodeBlock'
import { baseRemarkPlugins } from './markdownPlugins'
import remarkUserFilePaths from './remarkUserFilePaths'
import { stripReferenceAtSigns as stripMessageReferenceAtSigns } from './references'

const isReferenceUri = (url: string) => /^alma:\/\/(?!connect)[^/]+\//.test(url)
const keepReferenceUrls = (url: string) =>
  isReferenceUri(url) ? url : defaultUrlTransform(url)

type AnchorProps = ComponentProps<'a'> & { node?: unknown }
type ImageProps = ComponentProps<'img'> & { node?: unknown }

const MarkdownSourceContext = createContext('')

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
  const block = (
    <CodeBlock node={node} {...props}>
      {children}
    </CodeBlock>
  )
  if (!isMermaid) return block
  const source = code.children
    .map((child) => (child.type === 'text' ? child.value : ''))
    .join('')
  const raw = markdownSource.slice(
    node?.position?.start.offset,
    node?.position?.end.offset,
  )
  return (
    <MermaidPreview source={source} closed={closedFence(raw)}>
      {block}
    </MermaidPreview>
  )
}

export function MarkdownContent({
  text,
  linkUserFilePaths = false,
  references = true,
  renderReference,
  renderLink,
  renderImage,
  components,
  className = '',
}: {
  text: string
  linkUserFilePaths?: boolean
  references?: boolean
  renderReference?: (href: string, children: ReactNode) => ReactNode
  renderLink?: (props: AnchorProps) => ReactNode
  renderImage?: (props: ImageProps) => ReactNode
  components?: ComponentProps<typeof Markdown>['components']
  className?: string
}) {
  const [math, setMath] = useState<typeof import('./richMath')>()
  const needsMath = /\$|```math|~~~math/.test(text)
  useEffect(() => {
    if (needsMath) void import('./richMath').then(setMath)
  }, [needsMath])
  const guarded = guardCurrency(text)
  return (
    <MarkdownSourceContext.Provider value={guarded}>
      <div className={`markdown-content${className ? ` ${className}` : ''}`}>
        <Markdown
          remarkPlugins={[
            ...baseRemarkPlugins,
            ...(math ? [math.remarkMath] : []),
            ...(references ? [() => stripMessageReferenceAtSigns] : []),
            ...(linkUserFilePaths ? [remarkUserFilePaths] : []),
          ]}
          rehypePlugins={
            math ? [[math.rehypeKatex, { trust: false, strict: 'warn' }]] : []
          }
          urlTransform={keepReferenceUrls}
          components={{
            ...components,
            a({ href, children, node, ...props }) {
              if (href && isReferenceUri(href) && renderReference)
                return renderReference(href, children)
              if (renderLink)
                return renderLink({ href, children, node, ...props })
              return (
                <a href={href} {...props}>
                  {children}
                </a>
              )
            },
            img({ node, ...props }) {
              return renderImage ? (
                renderImage({ node, ...props })
              ) : (
                <img {...props} />
              )
            },
            code({ className: codeClassName, children, ...props }) {
              const match = /language-(\w+)/.exec(codeClassName ?? '')
              return match ? (
                <SyntaxHighlighter
                  useInlineStyles={false}
                  language={match[1]}
                  PreTag="div"
                >
                  {String(children).replace(/\n$/, '')}
                </SyntaxHighlighter>
              ) : (
                <code className={codeClassName} {...props}>
                  {children}
                </code>
              )
            },
            pre: MarkdownPre,
            table({ children, ...props }) {
              return (
                <div className="markdown-table-wrap">
                  <table {...props}>{children}</table>
                </div>
              )
            },
          }}
        >
          {guarded}
        </Markdown>
      </div>
    </MarkdownSourceContext.Provider>
  )
}
