// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { WorkspaceFavicon } from './WorkspaceFavicon'
import {
  getCachedWorkspaceFavicon,
  peekWorkspaceFavicon,
} from './workspaceFaviconCache'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const icon = 'data:image/png;base64,ws'

it('shows the workspace icon once it loads', async () => {
  const api = { getWorkspaceFavicon: vi.fn().mockResolvedValue(icon) }
  const { container } = render(
    <WorkspaceFavicon api={api} workspaceId="ws-app" round="r1" />,
  )

  await waitFor(() =>
    expect(container.querySelector('img')?.getAttribute('src')).toBe(icon),
  )
  expect(container.querySelector('img')?.getAttribute('alt')).toBe('')
  expect(api.getWorkspaceFavicon).toHaveBeenCalledWith('ws-app')
})

it('shows the cached icon immediately when the list remounts', async () => {
  const api = { getWorkspaceFavicon: vi.fn().mockResolvedValue(icon) }
  const first = render(
    <WorkspaceFavicon api={api} workspaceId="ws-app" round="r1" />,
  )
  await waitFor(() => expect(first.container.querySelector('img')).toBeTruthy())
  first.unmount()

  const { container } = render(
    <WorkspaceFavicon api={api} workspaceId="ws-app" round="r1" />,
  )
  expect(container.querySelector('img')?.getAttribute('src')).toBe(icon)
  expect(api.getWorkspaceFavicon).toHaveBeenCalledOnce()
})

it('renders nothing when the workspace has no icon', async () => {
  const api = { getWorkspaceFavicon: vi.fn().mockResolvedValue(null) }
  const { container } = render(
    <WorkspaceFavicon api={api} workspaceId="ws-plain" round="r1" />,
  )

  // Wait for the settled answer, not just the request going out.
  await waitFor(() => expect(peekWorkspaceFavicon(api, 'ws-plain')).toBeNull())
  await getCachedWorkspaceFavicon(api, 'ws-plain', 'r1')
  expect(container.innerHTML).toBe('')
  expect(api.getWorkspaceFavicon).toHaveBeenCalledOnce()
})

it('retries a failed icon after a reconnect while the row stays mounted', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  let fail: (error: Error) => void = () => undefined
  const api = {
    getWorkspaceFavicon: vi.fn(
      () =>
        new Promise<string | null>((_resolve, reject) => {
          fail = reject
        }),
    ),
  }
  const { container, rerender } = render(
    <WorkspaceFavicon api={api} workspaceId="ws-app" round="1:0" />,
  )
  await waitFor(() => expect(api.getWorkspaceFavicon).toHaveBeenCalledOnce())
  fail(new Error('relay offline'))
  await waitFor(() => expect(console.warn).toHaveBeenCalled())
  expect(container.innerHTML).toBe('')
  expect(peekWorkspaceFavicon(api, 'ws-app')).toBeUndefined()

  api.getWorkspaceFavicon.mockResolvedValueOnce(icon)
  rerender(<WorkspaceFavicon api={api} workspaceId="ws-app" round="2:0" />)

  await waitFor(() =>
    expect(container.querySelector('img')?.getAttribute('src')).toBe(icon),
  )
  expect(api.getWorkspaceFavicon).toHaveBeenCalledTimes(2)
})

it('drops an icon the WebView cannot decode', async () => {
  const api = { getWorkspaceFavicon: vi.fn().mockResolvedValue(icon) }
  const { container } = render(
    <WorkspaceFavicon api={api} workspaceId="ws-broken" round="r1" />,
  )
  await waitFor(() => expect(container.querySelector('img')).toBeTruthy())

  fireEvent.error(container.querySelector('img')!)

  expect(container.innerHTML).toBe('')
})
