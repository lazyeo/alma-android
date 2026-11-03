// @vitest-environment jsdom
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { clearMarkdownRenderCache, MarkdownContent } from './MarkdownContent'

const mocks = vi.hoisted(() => ({ renderMarkdown: vi.fn() }))

vi.mock('react-markdown', () => ({
  default: ({
    children,
    rehypePlugins,
  }: {
    children: string
    rehypePlugins?: unknown[]
  }) => {
    mocks.renderMarkdown(children, rehypePlugins?.length ?? 0)
    return <div>{children}</div>
  },
  defaultUrlTransform: (url: string) => url,
}))

vi.mock('./richMath', () => ({
  remarkMath: Symbol('remarkMath'),
  rehypeKatex: Symbol('rehypeKatex'),
}))

afterEach(() => {
  clearMarkdownRenderCache()
  mocks.renderMarkdown.mockClear()
})

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

it('reuses rendered markdown after an identical remount', () => {
  const components = {}
  const first = render(
    <MarkdownContent text="Cached **markdown**" components={components} />,
  )
  expect(mocks.renderMarkdown).toHaveBeenCalledTimes(1)
  first.unmount()

  render(<MarkdownContent text="Cached **markdown**" components={components} />)
  expect(mocks.renderMarkdown).toHaveBeenCalledTimes(1)
})

it('misses the cache when the components identity changes', () => {
  const first = render(
    <MarkdownContent text="Cached **markdown**" components={{}} />,
  )
  first.unmount()

  render(<MarkdownContent text="Cached **markdown**" components={{}} />)
  expect(mocks.renderMarkdown).toHaveBeenCalledTimes(2)
})

it('misses the cache when math finishes loading', async () => {
  render(<MarkdownContent text="$x^2$" />)
  expect(mocks.renderMarkdown).toHaveBeenCalledWith('$x^2$', 0)

  await act(async () => {})
  await waitFor(() =>
    expect(mocks.renderMarkdown).toHaveBeenCalledWith('$x^2$', 1),
  )
  expect(mocks.renderMarkdown).toHaveBeenCalledTimes(2)
})
