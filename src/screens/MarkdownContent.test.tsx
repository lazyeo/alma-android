// @vitest-environment jsdom
import { render, waitFor, cleanup, screen, act } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { clearSiteIconCache } from './siteIconCache'
import { MarkdownContent } from './MarkdownContent'
const mocks = vi.hoisted(() => ({
  render: vi.fn(async () => ({ svg: '<svg />' })),
  initialize: vi.fn(),
}))
vi.mock('mermaid', () => ({ default: mocks }))
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.clearAllMocks()
  clearSiteIconCache()
})
it('renders a loaded favicon before external link text without changing link behavior', async () => {
  const getSiteIcon = vi
    .fn()
    .mockResolvedValue('data:image/png;base64,external-icon')
  const onClick = vi.fn((event: React.MouseEvent<HTMLAnchorElement>) =>
    event.preventDefault(),
  )

  render(
    <MarkdownContent
      text="Read [the guide](https://example.com/docs)."
      getSiteIcon={getSiteIcon}
      renderLink={({ node: _node, children, ...props }) => (
        <a {...props} onClick={onClick}>
          {children}
        </a>
      )}
    />,
  )

  const link = screen.getByRole('link', { name: 'the guide' })
  await waitFor(() =>
    expect(link.querySelector('.markdown-link-favicon')).toBeTruthy(),
  )
  const icon = link.querySelector('.markdown-link-favicon')!
  expect(icon.getAttribute('src')).toBe('data:image/png;base64,external-icon')
  expect(link.firstElementChild).toBe(icon)
  link.click()
  expect(onClick).toHaveBeenCalledOnce()
  expect(getSiteIcon).toHaveBeenCalledWith('https://example.com/docs')
})

it('does not request favicons for references or non-http links', () => {
  const getSiteIcon = vi.fn()
  render(
    <MarkdownContent
      text={
        '@[Thread](alma://thread/one) [relative](./note) [mail](mailto:a@example.com)'
      }
      getSiteIcon={getSiteIcon}
      renderReference={(_href, children) => <span>{children}</span>}
    />,
  )

  expect(getSiteIcon).not.toHaveBeenCalled()
})

it('renders inline double-dollar, display and fenced math but keeps currency literal', async () => {
  const { container } = render(
    <MarkdownContent
      text={'Pay $5 and $10. $$x^2$$\n\n$$\ny=2\n$$\n\n```math\nz=3\n```'}
    />,
  )
  await waitFor(() =>
    expect(container.querySelectorAll('.katex')).toHaveLength(3),
  )
  expect(container.textContent).toContain('Pay $5 and $10.')
  expect(mocks.render).not.toHaveBeenCalled()
})

// Waits for the KaTeX chunk via a sibling that needs it, so a missing .katex
// below means "not math" rather than "not loaded yet".
async function renderBesideLoadedMath(node: React.ReactNode) {
  const view = render(
    <>
      <MarkdownContent className="probe" text="$$p$$" />
      {node}
    </>,
  )
  await waitFor(() =>
    expect(view.container.querySelector('.probe .katex')).toBeTruthy(),
  )
  return view
}

it('keeps single-dollar spans and escaped parentheses literal in assistant text', async () => {
  const { container } = await renderBesideLoadedMath(
    <MarkdownContent
      className="subject"
      text={'(a) 和 (b)，\\(x\\)，价格 $5 和 $10，$x$ 与 $y$。$$z$$'}
    />,
  )
  const subject = container.querySelector('.subject')!
  expect(subject.querySelectorAll('.katex')).toHaveLength(1)
  // CommonMark drops the backslash escapes; the parentheses stay prose.
  expect(subject.textContent).toContain(
    '(a) 和 (b)，(x)，价格 $5 和 $10，$x$ 与 $y$。',
  )
})

it('never renders user-authored text as math', async () => {
  const { container } = await renderBesideLoadedMath(
    <MarkdownContent
      className="subject"
      math={false}
      text={'(a) 和 (b)\n\n\\(x\\)\n\n价格 $5 和 $10\n\n$$y=2$$'}
    />,
  )
  const subject = container.querySelector('.subject')!
  expect(subject.querySelector('.katex')).toBeNull()
  expect(subject.textContent).toContain('(a) 和 (b)')
  expect(subject.textContent).toContain('(x)')
  expect(subject.textContent).toContain('价格 $5 和 $10')
  expect(subject.textContent).toContain('$$y=2$$')
})
it('debounces closed Mermaid fences and retains a copyable source toggle', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:diagram')
  URL.revokeObjectURL = vi.fn()
  vi.useFakeTimers()
  const { rerender, unmount } = render(
    <MarkdownContent text={'```mermaid\ngraph TD; A-->B'} />,
  )
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
  expect(mocks.render).not.toHaveBeenCalled()
  rerender(<MarkdownContent text={'```mermaid\ngraph TD; A-->B\n```'} />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(349)
  })
  expect(mocks.render).not.toHaveBeenCalled()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1)
  })
  expect(mocks.initialize).toHaveBeenCalledWith(
    expect.objectContaining({ securityLevel: 'strict' }),
  )
  expect(screen.getByRole('img').getAttribute('src')).toBe('blob:diagram')
  act(() => screen.getByRole('button', { name: 'Source' }).click())
  expect(screen.getByRole('button', { name: 'Copy code' })).toBeTruthy()
  unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:diagram')
})
it('shows a failure note and source when diagram rendering fails', async () => {
  mocks.render.mockRejectedValueOnce(new Error('bad syntax'))
  render(<MarkdownContent text={'```mermaid\nbroken\n```'} />)
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain(
      'could not be rendered',
    ),
  )
  expect(screen.getByText('broken')).toBeTruthy()
})

it('preserves a completed Mermaid preview lifecycle when streaming appends text', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:stable-diagram')
  URL.revokeObjectURL = vi.fn()
  vi.useFakeTimers()
  const text = '```mermaid\ngraph TD; A-->B\n```\n\nAnswer'
  const { rerender, unmount } = render(<MarkdownContent text={text} />)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(350)
  })
  const image = screen.getByRole('img')
  act(() => screen.getByRole('button', { name: 'Source' }).click())

  rerender(<MarkdownContent text={`${text} continues streaming.`} />)
  expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  act(() => screen.getByRole('button', { name: 'Diagram' }).click())
  expect(screen.getByRole('img')).toBe(image)
  act(() => screen.getByRole('button', { name: 'Source' }).click())
  expect(screen.getByRole('button', { name: 'Diagram' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Copy code' })).toBeTruthy()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500)
  })
  expect(mocks.render).toHaveBeenCalledTimes(1)
  expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
  unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledExactlyOnceWith(
    'blob:stable-diagram',
  )
})

it('keeps the same table scroller across re-renders so horizontal scroll survives', () => {
  const text = '| a | b |\n| - | - |\n| 1 | 2 |'
  const renderLink = () => null
  const { container, rerender } = render(
    <MarkdownContent text={text} renderLink={renderLink} />,
  )
  const wrap = container.querySelector('.markdown-table-wrap')
  expect(wrap).not.toBeNull()
  ;(wrap as HTMLElement).scrollLeft = 120
  // A parent re-render (e.g. a connection latency update) passes fresh callbacks.
  rerender(<MarkdownContent text={text} renderLink={() => null} />)
  expect(container.querySelector('.markdown-table-wrap')).toBe(wrap)
})

it.each([
  ['no language', '```\nconst a = 1\n```', 'const a = 1'],
  ['an unknown language', '```notalang\nconst a = 1\n```', 'const a = 1'],
  ['a language with symbols', '```c++\nint a = 1;\n```', 'int a = 1;'],
  ['an empty block', '```\n```', ''],
  ['an empty block with a language', '```ts\n```', ''],
  [
    'a block inside a list item',
    '- step\n\n  ```\n  npm test\n  ```',
    'npm test',
  ],
  [
    'an unlabeled block inside a list item',
    '1. step\n   ```\n   echo hi\n   ```',
    'echo hi',
  ],
])(
  'renders a fenced block with %s as code without throwing',
  (_label, text, code) => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { container } = render(<MarkdownContent text={text} />)
      const pre = container.querySelector('pre')
      expect(pre).not.toBeNull()
      expect(pre?.textContent ?? '').toContain(code)
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  },
)
