import { fromMarkdown } from 'mdast-util-from-markdown'
import type { Nodes } from 'mdast'

/** Escape dollar amounts outside Markdown code. Numeric math with operators remains math. */
export function guardCurrency(text: string): string {
  if (!text.includes('$')) return text
  const codeRanges: [number, number][] = []
  function collectCode(node: Nodes) {
    if (node.type === 'code' || node.type === 'inlineCode') {
      const start = node.position?.start.offset
      const end = node.position?.end.offset
      if (start !== undefined && end !== undefined)
        codeRanges.push([start, end])
    } else if ('children' in node) {
      node.children.forEach(collectCode)
    }
  }
  collectCode(fromMarkdown(text))

  // Use parser offsets rather than serializing the tree, preserving code bytes
  // (including indentation, delimiters and line endings) exactly.
  let rangeIndex = 0
  return text.replace(
    /(?<![\\$])\$(?!\$)(\d[\d,.]*)(?![\d,.])/g,
    (match, amount: string, offset: number) => {
      while (codeRanges[rangeIndex] && codeRanges[rangeIndex][1] <= offset)
        rangeIndex++
      const range = codeRanges[rangeIndex]
      if (range && range[0] <= offset) return match
      const lineStart = text.lastIndexOf('\n', offset) + 1
      if (/^\s*\$\$/.test(text.slice(lineStart, offset + match.length)))
        return match
      const rest = text.slice(offset + match.length)
      return /^(?:\$|[^\S\r\n]*[+\-*/^_=<>\\])/.test(rest)
        ? match
        : `\\$${amount}`
    },
  )
}

export function closedFence(source: string): boolean {
  const lines = source.trimEnd().split('\n')
  const open = /^\s*(`{3,}|~{3,})\w*/.exec(lines[0])?.[1]
  const close = /^\s*(`{3,}|~{3,})\s*$/.exec(lines.at(-1) ?? '')?.[1]
  return (
    lines.length > 1 &&
    !!open &&
    !!close &&
    open[0] === close[0] &&
    close.length >= open.length
  )
}
