// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { AlmaApi } from '../relay'
import { useComposerReferences } from './useComposerReferences'

const kinds = [
  {
    kind: 'thread',
    label: 'Threads',
    prefixes: ['thread'],
    order: 1,
    scope: 'global',
    available: true,
  },
]

function api() {
  return {
    listRefKinds: vi.fn().mockResolvedValue({ kinds }),
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

describe('useComposerReferences', () => {
  it('opens on @, inserts a picked reference, and materializes it for sending', async () => {
    const client = api()
    const textareaRef = createRef<HTMLTextAreaElement>()
    const { result } = renderHook(() =>
      useComposerReferences({
        api: client,
        initialContent: '',
        textareaRef,
        workspaceId: 'workspace-1',
      }),
    )

    await waitFor(() => expect(result.current.kinds).toEqual(kinds))

    act(() => result.current.changeText('@', 1, false))
    expect(result.current.trigger).toEqual({
      start: 0,
      end: 1,
      query: '',
    })

    act(() =>
      result.current.pick({
        uri: 'alma://thread/roadmap',
        kind: 'thread',
        title: 'Roadmap',
      }),
    )

    expect(result.current.text).toBe('@Roadmap ')
    expect(result.current.content()).toBe('@[Roadmap](alma://thread/roadmap) ')
  })

  it.each([
    ['', '① label'],
    ['Keep this context', 'Keep this context\n\n① label'],
  ])(
    'appends annotation text to %j and places the caret at the end',
    (initialContent, expected) => {
      const textarea = document.createElement('textarea')
      document.body.append(textarea)
      const textareaRef = { current: textarea }
      const { result } = renderHook(() =>
        useComposerReferences({
          api: api(),
          initialContent,
          textareaRef,
        }),
      )

      act(() => result.current.appendText('① label'))

      expect(result.current.text).toBe(expected)
      expect(result.current.content()).toBe(expected)
      expect(textarea.selectionStart).toBe(expected.length)
      expect(textarea.selectionEnd).toBe(expected.length)
      textarea.remove()
    },
  )

  it('restores materialized drafts as editable labels', () => {
    const client = api()
    const { result } = renderHook(() =>
      useComposerReferences({
        api: client,
        initialContent: 'Open @[Roadmap](alma://thread/roadmap)',
        textareaRef: createRef<HTMLTextAreaElement>(),
      }),
    )

    expect(result.current.text).toBe('Open @Roadmap')
    expect(result.current.references).toEqual([
      {
        label: 'Roadmap',
        uri: 'alma://thread/roadmap',
        kind: 'thread',
      },
    ])
  })
})
