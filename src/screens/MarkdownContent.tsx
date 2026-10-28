import type { ComponentProps, ReactNode } from 'react'
import Markdown, { defaultUrlTransform } from 'react-markdown'
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
  return (
    <div className={`markdown-content${className ? ` ${className}` : ''}`}>
      <Markdown
        remarkPlugins={[
          ...baseRemarkPlugins,
          ...(references ? [() => stripMessageReferenceAtSigns] : []),
          ...(linkUserFilePaths ? [remarkUserFilePaths] : []),
        ]}
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
          pre: CodeBlock,
          table({ children, ...props }) {
            return (
              <div className="markdown-table-wrap">
                <table {...props}>{children}</table>
              </div>
            )
          },
        }}
      >
        {text}
      </Markdown>
    </div>
  )
}
