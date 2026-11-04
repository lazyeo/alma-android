// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AlmaApi, Thread } from '../relay'
import { ProjectCardSection } from './ProjectCardSection'

vi.mock('../desktops/ThreadActivityProvider', () => ({
  useDesktopThreadEvents: () => undefined,
}))
vi.mock('../haptics', () => ({ haptic: () => Promise.resolve() }))

const api = {
  getProjectCard: vi.fn(async () => ({
    card: { brief: 'Brief', focus: 'Focus', resume: [] },
  })),
} as unknown as AlmaApi

const thread = (id: string, day: number): Thread =>
  ({
    id,
    title: `Thread ${id}`,
    workspaceId: 'p1',
    updatedAt: `2026-11-${String(day).padStart(2, '0')}T00:00:00Z`,
  }) as Thread

const renderSection = (
  threads: Thread[],
  handlers: { onOpenThread?(thread: Thread): void; onShowAll?(): void } = {},
) => {
  const props = {
    api,
    desktopId: 'd1',
    workspaceId: 'p1',
    onNavigate: vi.fn(),
    onOpenThread: handlers.onOpenThread ?? vi.fn(),
    onShowAllThreads: handlers.onShowAll ?? vi.fn(),
  }
  const view = render(<ProjectCardSection {...props} threads={threads} />)
  return {
    ...view,
    rerenderThreads: (next: Thread[]) =>
      view.rerender(<ProjectCardSection {...props} threads={next} />),
  }
}

const openCard = async () => {
  fireEvent.click(
    await screen.findByRole('button', { name: /No project card yet|Brief/ }),
  )
  return screen.getByRole('dialog')
}

const recentTitles = (sheet: HTMLElement) =>
  Array.from(
    sheet.querySelectorAll('.project-card-recent .project-thread-row'),
  ).map((row) => row.firstElementChild?.textContent)

afterEach(cleanup)

describe('ProjectCardSection recent threads', () => {
  it('lists the five newest threads and a Show all count', async () => {
    const onShowAll = vi.fn()
    renderSection(
      [1, 7, 3, 6, 2, 5, 4].map((day) => thread(`t${day}`, day)),
      { onShowAll },
    )
    const sheet = await openCard()
    expect(within(sheet).getByText('Recent')).toBeTruthy()
    expect(recentTitles(sheet)).toEqual([
      'Thread t7',
      'Thread t6',
      'Thread t5',
      'Thread t4',
      'Thread t3',
    ])
    fireEvent.click(
      within(sheet).getByRole('button', { name: /Show all \(7\)/ }),
    )
    expect(onShowAll).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('opens a thread from its row and closes the sheet', async () => {
    const onOpenThread = vi.fn()
    const rows = [thread('a', 1), thread('b', 2)]
    renderSection(rows, { onOpenThread })
    const sheet = await openCard()
    expect(within(sheet).queryByRole('button', { name: /Show all/ })).toBeNull()
    fireEvent.click(within(sheet).getByText('Thread a'))
    expect(onOpenThread).toHaveBeenCalledWith(rows[0])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('re-sorts with the latest activity when the sheet is reopened', async () => {
    const { rerenderThreads } = renderSection([thread('a', 1), thread('b', 2)])
    let sheet = await openCard()
    expect(recentTitles(sheet)).toEqual(['Thread b', 'Thread a'])
    fireEvent.click(within(sheet).getByRole('button', { name: /close/i }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    rerenderThreads([thread('a', 9), thread('b', 2)])
    sheet = await openCard()
    expect(recentTitles(sheet)).toEqual(['Thread a', 'Thread b'])
  })

  it('hides the section for a project without threads', async () => {
    renderSection([])
    const sheet = await openCard()
    expect(within(sheet).queryByText('Recent')).toBeNull()
    expect(sheet.querySelector('.project-card-recent')).toBeNull()
  })
})
