// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { ConnectionContext } from '../desktops/DesktopContext'
import type { AlmaApi, StoredPairing } from '../relay'
import { StartScreen } from './StartScreen'

const pairing = {
  id: 'desktop-1',
  name: 'Desktop',
} as StoredPairing

function api() {
  return {
    getStartSuggestions: vi.fn().mockResolvedValue([]),
    listWorkspaces: vi
      .fn()
      .mockResolvedValue([{ id: 'workspace-1', name: 'Workspace' }]),
    listModels: vi.fn().mockResolvedValue([
      {
        id: 'provider:model',
        modelId: 'model',
        name: 'Model',
        provider: 'Provider',
        providerId: 'provider',
        capabilities: {},
      },
    ]),
    getSettings: vi.fn().mockResolvedValue({
      general: { defaultWorkspaceId: 'workspace-1' },
      chat: { defaultModel: 'provider:model' },
    }),
    listRefKinds: vi.fn().mockResolvedValue({
      kinds: [
        {
          kind: 'thread',
          label: 'Threads',
          prefixes: ['thread'],
          order: 1,
          scope: 'global',
          available: true,
        },
      ],
    }),
    listRecentRefs: vi.fn().mockResolvedValue({
      items: [
        {
          uri: 'alma://thread/roadmap',
          kind: 'thread',
          label: 'Roadmap',
          count: 1,
          lastAt: 1,
        },
      ],
    }),
    resolveRefs: vi.fn().mockResolvedValue({
      results: [
        {
          uri: 'alma://thread/roadmap',
          kind: 'thread',
          id: 'roadmap',
          exists: true,
          title: 'Roadmap',
        },
      ],
    }),
    searchRefs: vi.fn().mockResolvedValue({ query: '', results: [] }),
  } as unknown as AlmaApi
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      values: new Map<string, string>(),
      getItem(key: string) {
        return this.values.get(key) ?? null
      },
      setItem(key: string, value: string) {
        this.values.set(key, value)
      },
      removeItem(key: string) {
        this.values.delete(key)
      },
      clear() {
        this.values.clear()
      },
    },
  })
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  })
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('StartScreen references', () => {
  it('opens the picker on @ and inserts the picked reference token', async () => {
    const client = api()
    render(
      <MemoryRouter>
        <ConnectionContext.Provider
          value={{
            pairing,
            api: client,
            status: 'online',
            transport: 'relay',
            tunnel: {} as never,
          }}
        >
          <StartScreen />
        </ConnectionContext.Provider>
      </MemoryRouter>,
    )

    const textarea = await screen.findByPlaceholderText(
      'Type something. Anything.',
    )
    fireEvent.change(textarea, { target: { value: '@' } })

    expect(await screen.findByLabelText('Insert reference')).toBeTruthy()
    fireEvent.click(await screen.findByRole('option', { name: /Roadmap/ }))

    await waitFor(() =>
      expect((textarea as HTMLTextAreaElement).value).toBe('@Roadmap '),
    )
  })
})

describe('StartScreen attachment markup', () => {
  it('hands annotation labels from the tray to the composer text', async () => {
    // The start screen owns its own tray; a missing callback silently drops
    // the "① …" lines after Done (found on a real device, 2026-10-31).
    const fs = await import('node:fs')
    const path = await import('node:path')
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/screens/StartScreen.tsx'),
      'utf8',
    )
    const tray = source.slice(
      source.indexOf('<ComposerAttachmentTray'),
      source.indexOf('/>', source.indexOf('<ComposerAttachmentTray')),
    )
    expect(tray).toContain('onAnnotationText={references.appendText}')
  })
})
