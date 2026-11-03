// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import { MarkdownContent } from './MarkdownContent'

const mocks = vi.hoisted(() => ({ renderMarkdown: vi.fn() }))

vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => {
    mocks.renderMarkdown(children)
    return <div>{children}</div>
  },
  defaultUrlTransform: (url: string) => url,
}))

it('does not re-render markdown when its inputs stay unchanged', () => {
  const renderReference = (_href: string, children: React.ReactNode) => children
  const renderLink = ({ children }: { children?: React.ReactNode }) => children
  const getSiteIcon = async () => null

  function Parent() {
    const [count, setCount] = useState(0)
    return (
      <>
        <button onClick={() => setCount((value) => value + 1)}>{count}</button>
        <MarkdownContent
          text="Stable **markdown**"
          renderReference={renderReference}
          renderLink={renderLink}
          getSiteIcon={getSiteIcon}
        />
      </>
    )
  }

  const { getByRole } = render(<Parent />)
  expect(mocks.renderMarkdown).toHaveBeenCalledTimes(1)
  fireEvent.click(getByRole('button'))
  expect(mocks.renderMarkdown).toHaveBeenCalledTimes(1)
})
