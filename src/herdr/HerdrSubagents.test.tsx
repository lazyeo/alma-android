// @vitest-environment jsdom
import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { AlmaApi } from '../relay/almaApi'
import { HerdrSubagentsSheet } from './HerdrSubagents'

vi.mock('../components/BottomSheet', () => ({
  BottomSheet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('../i18n', () => ({ useT: () => (key: string) => key }))
vi.mock('../messages', () => ({ MessageView: () => null }))
vi.mock('../screens/ImageGallery', () => ({
  ImageGalleryProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}))
vi.mock('../screens/LoadingOrbCanvas', () => ({ LoadingOrb: () => null }))
vi.mock('../screens/MarkdownContent', () => ({ MarkdownContent: () => null }))
vi.mock('../screens/RelayImage', () => ({ RelayImage: () => null }))

function setVisibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: state,
  })
  fireEvent(document, new Event('visibilitychange'))
}

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

it('pauses subagent polling while hidden and resumes immediately when visible', async () => {
  vi.useFakeTimers()
  setVisibility('visible')
  const getHerdrSubagent = vi.fn(async () => ({
    status: 'ok' as const,
    agent: { description: 'Researching', finished: false },
    page: { items: [] },
  }))

  render(
    <HerdrSubagentsSheet
      api={{ getHerdrSubagent } as unknown as AlmaApi}
      paneId="pane-a"
      parentAgent="claude"
      subagents={[
        {
          toolId: 'tool-a',
          title: 'Researching',
          type: 'Explore',
          running: true,
          error: false,
          startedAt: Date.now(),
        },
      ]}
      initialToolId="tool-a"
      onClose={() => undefined}
    />,
  )

  await act(async () => undefined)
  expect(getHerdrSubagent).toHaveBeenCalledTimes(1)
  setVisibility('hidden')
  await vi.advanceTimersByTimeAsync(4_500)
  expect(getHerdrSubagent).toHaveBeenCalledTimes(1)

  setVisibility('visible')
  await act(async () => undefined)
  expect(getHerdrSubagent).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1_500)
  expect(getHerdrSubagent).toHaveBeenCalledTimes(3)
})
