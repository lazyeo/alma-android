// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { codeBlockLanguage } from './CodeBlock'
import { MarkdownContent } from './MarkdownContent'

afterEach(cleanup)

describe('codeBlockLanguage', () => {
  it('reads the fence language from the inner code element', () => {
    const node = {
      tagName: 'pre',
      children: [
        { tagName: 'code', properties: { className: ['language-ts'] } },
      ],
    }
    expect(codeBlockLanguage(node)).toBe('ts')
    expect(
      codeBlockLanguage({ children: [{ tagName: 'code' }] }),
    ).toBeUndefined()
  })
})

describe('code block copy', () => {
  it('copies highlighted and plain fences without the trailing newline', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <MarkdownContent
        text={'```ts\nconst a = 1\nconst b = 2\n```\n\n```\nplain text\n```'}
      />,
    )
    const buttons = screen.getAllByRole('button', { name: 'Copy code' })
    expect(buttons).toHaveLength(2)
    expect(screen.getByText('ts')).toBeTruthy()
    await act(async () => fireEvent.click(buttons[0]))
    expect(writeText).toHaveBeenLastCalledWith('const a = 1\nconst b = 2')
    expect(screen.getByRole('button', { name: 'Copied code' })).toBeTruthy()
    await act(async () => fireEvent.click(buttons[1]))
    expect(writeText).toHaveBeenLastCalledWith('plain text')
  })

  it('leaves inline code alone', () => {
    render(<MarkdownContent text="run `npm test` first" />)
    expect(screen.queryByRole('button', { name: 'Copy code' })).toBeNull()
  })
})
