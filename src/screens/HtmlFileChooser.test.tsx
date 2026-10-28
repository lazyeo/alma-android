// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { AlmaHttpError } from '../relay/almaApi'
import { HtmlFileChooser } from './HtmlFileChooser'

const openFile = vi.fn()
const listPreviewHtmlFiles = vi.fn()
const listWorkspaces = vi.fn()
const api = { listPreviewHtmlFiles, listWorkspaces }

vi.mock('../desktops/DesktopContext', () => ({
  useConnection: () => ({ api }),
}))
vi.mock('./FileLinkSheet', () => ({
  useFileLinks: () => ({ openFile }),
}))

beforeEach(() => {
  listWorkspaces.mockResolvedValue([{ id: 'ws-app', name: 'App', path: '/w' }])
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

it('lists workspace HTML files and opens the chosen one', async () => {
  listPreviewHtmlFiles.mockResolvedValue({ htmlFiles: ['site/index.html'] })
  const onClose = vi.fn()
  render(<HtmlFileChooser workspaceId="ws-app" onClose={onClose} />)

  expect(screen.getByRole('dialog', { name: 'Preview HTML' })).toBeTruthy()
  fireEvent.click(await screen.findByRole('button', { name: /index\.html/ }))

  expect(listPreviewHtmlFiles).toHaveBeenCalledWith('ws-app')
  expect(openFile).toHaveBeenCalledWith('/w/site/index.html')
  expect(onClose).toHaveBeenCalled()
})

it('says when the project has no HTML files', async () => {
  listPreviewHtmlFiles.mockResolvedValue({ htmlFiles: [] })
  render(<HtmlFileChooser workspaceId="ws-app" onClose={vi.fn()} />)
  expect(await screen.findByText('No HTML files in this project')).toBeTruthy()
})

it('explains an older desktop without the endpoint', async () => {
  listPreviewHtmlFiles.mockRejectedValue(new AlmaHttpError('GET failed', 404))
  render(<HtmlFileChooser workspaceId="ws-app" onClose={vi.fn()} />)
  expect(
    await screen.findByText('Update Alma on the desktop to list HTML files.'),
  ).toBeTruthy()
})

it('offers a retry after a failed load', async () => {
  listPreviewHtmlFiles
    .mockRejectedValueOnce(new Error('socket closed'))
    .mockResolvedValueOnce({ htmlFiles: ['a.html'] })
  render(<HtmlFileChooser workspaceId="ws-app" onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
  expect(await screen.findByRole('button', { name: /a\.html/ })).toBeTruthy()
})
