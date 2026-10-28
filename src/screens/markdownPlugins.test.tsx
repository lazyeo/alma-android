import Markdown from 'react-markdown'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { baseRemarkPlugins } from './markdownPlugins'

const html = (text: string) =>
  renderToStaticMarkup(
    <Markdown remarkPlugins={baseRemarkPlugins}>{text}</Markdown>,
  )

describe('CJK-friendly emphasis', () => {
  it.each([
    [
      '而是**"多个会话同时改同一个仓库"时的协作流程**',
      '<strong>&quot;多个会话同时改同一个仓库&quot;时的协作流程</strong>',
    ],
    ['这是**「重点」**内容', '<strong>「重点」</strong>'],
    ['步骤**（可选）**完成', '<strong>（可选）</strong>'],
    ['看**《手册》**第三章', '<strong>《手册》</strong>'],
    ['这是*"斜体"*文字', '<em>&quot;斜体&quot;</em>'],
    ['这个~~"旧方案"~~不用了', '<del>&quot;旧方案&quot;</del>'],
  ])('renders %s', (input, expected) => {
    const out = html(input)
    expect(out).toContain(expected)
    expect(out).not.toContain('**')
  })

  it('keeps ordinary English emphasis and literal asterisks', () => {
    expect(html('a **bold** word')).toContain('<strong>bold</strong>')
    expect(html('2 * 3 * 4')).toContain('2 * 3 * 4')
    expect(html('snake**case**name')).toContain('<strong>case</strong>')
  })
})
