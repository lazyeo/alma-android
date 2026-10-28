// @vitest-environment jsdom
import { render, waitFor, cleanup, screen, act } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
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
})
it('renders inline, display and fenced math but keeps currency literal', async () => {
  const { container } = render(
    <MarkdownContent
      text={'Pay $5 and $10. $x^2$\n\n$$\ny=2\n$$\n\n```math\nz=3\n```'}
    />,
  )
  await waitFor(() =>
    expect(container.querySelectorAll('.katex')).toHaveLength(3),
  )
  expect(container.textContent).toContain('Pay $5 and $10.')
  expect(mocks.render).not.toHaveBeenCalled()
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
  act(() => screen.getByText('Show source').click())
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
  act(() => screen.getByText('Show source').click())

  rerender(<MarkdownContent text={`${text} continues streaming.`} />)
  expect(URL.revokeObjectURL).not.toHaveBeenCalled()
  expect(screen.getByRole('img')).toBe(image)
  expect(screen.getByText('Hide source')).toBeTruthy()
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
