import { Check, Copy } from 'lucide-react'
import { useEffect, useRef, useState, type ComponentProps } from 'react'
import { copyText } from '../clipboard'
import { haptic } from '../haptics'
import { useT } from '../i18n'

type HastNode = {
  tagName?: string
  properties?: { className?: unknown }
  children?: HastNode[]
}

const COPIED_MS = 1500

/** Reads the fence language from the inner `<code class="language-x">`. */
export function codeBlockLanguage(node: unknown): string | undefined {
  const code = (node as HastNode | undefined)?.children?.find(
    (child) => child.tagName === 'code',
  )
  const classes = code?.properties?.className
  const list = Array.isArray(classes) ? classes : [classes]
  for (const value of list) {
    const match = /^language-([\w+#.-]+)$/.exec(String(value ?? ''))
    if (match) return match[1]
  }
  return undefined
}

/** Fenced code text as the reader sees it, without the trailing newline. */
export function codeBlockText(element: HTMLElement | null) {
  return (element?.textContent ?? '').replace(/\n$/, '')
}

export function CodeBlock({
  node,
  children,
  ...props
}: ComponentProps<'pre'> & { node?: unknown }) {
  const preRef = useRef<HTMLPreElement>(null)
  const t = useT()
  const [copied, setCopied] = useState(false)
  const language = codeBlockLanguage(node)

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), COPIED_MS)
    return () => window.clearTimeout(timer)
  }, [copied])

  return (
    <div className="code-block">
      <div className="code-block-header">
        <span className="code-block-language">
          {language ?? t('message.code.language')}
        </span>
        <button
          type="button"
          className={`code-block-copy${copied ? ' copied' : ''}`}
          aria-label={t(copied ? 'message.code.copied' : 'message.code.copy')}
          onClick={() => {
            void haptic('light')
            void copyText(codeBlockText(preRef.current)).then(() =>
              setCopied(true),
            )
          }}
        >
          {copied ? (
            <Check size={14} aria-hidden="true" />
          ) : (
            <Copy size={14} aria-hidden="true" />
          )}
          <span>{t(copied ? 'common.copied' : 'common.copy')}</span>
        </button>
      </div>
      <pre ref={preRef} {...props}>
        {children}
      </pre>
    </div>
  )
}
