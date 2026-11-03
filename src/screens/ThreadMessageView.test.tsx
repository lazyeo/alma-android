// @vitest-environment jsdom
import { render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { MessageRow } from '../relay'
import { ThreadMessageView } from './ThreadScreen'

const mocks = vi.hoisted(() => ({ renderMessage: vi.fn() }))

vi.mock('../messages', () => ({
  MessageView: ({ row }: { row: MessageRow }) => {
    mocks.renderMessage(row)
    return <div>{row.message.parts[0]?.text}</div>
  },
  PartView: () => null,
}))

vi.mock('../components/useLongPress', () => ({
  useLongPress: () => ({}),
}))

vi.mock('./FileLinkSheet', () => ({
  FileAwareLink: ({ children }: { children?: React.ReactNode }) => children,
  FileLinkProvider: ({ children }: { children?: React.ReactNode }) => children,
  useFileLinks: () => ({ openFile: vi.fn() }),
}))

const row = (text: string): MessageRow => ({
  id: 'row-1',
  threadId: 'thread-1',
  message: {
    id: 'message-1',
    role: 'assistant',
    parts: [{ type: 'text', text }],
  },
})

it('skips unchanged rows but re-renders when the last streaming text changes', () => {
  const initialRow = row('First')
  const { rerender, getByText } = render(
    <ThreadMessageView row={initialRow} generating />,
  )
  rerender(<ThreadMessageView row={initialRow} generating />)
  expect(mocks.renderMessage).toHaveBeenCalledTimes(1)

  rerender(<ThreadMessageView row={row('First continued')} generating />)
  expect(getByText('First continued')).toBeTruthy()
  expect(mocks.renderMessage).toHaveBeenCalledTimes(2)
})
