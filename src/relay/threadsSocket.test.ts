import { describe, expect, it, vi } from 'vitest'
import { ThreadsSocket } from './almaApi'

describe('ThreadsSocket generation options', () => {
  it('sends model, reasoning effort, and fast mode', () => {
    const send = vi.fn()
    const socket = new ThreadsSocket({
      opened: Promise.resolve(),
      send,
      close: vi.fn(),
      onMessage: vi.fn(),
      onClose: vi.fn(),
    })

    const messageId = socket.generateResponse(
      'thread-1',
      'Hello',
      {
        model: 'openai:gpt-fast',
        reasoningEffort: 'high',
        fastMode: true,
      },
      'user-local-1',
    )

    expect(messageId).toBe('user-local-1')
    const frame = JSON.parse(send.mock.calls[0][0])
    expect(frame).toMatchObject({
      type: 'generate_response',
      data: {
        threadId: 'thread-1',
        userMessage: { id: 'user-local-1' },
        model: 'openai:gpt-fast',
        reasoningEffort: 'high',
        fastMode: true,
        source: 'mobile',
      },
    })
  })

  it('retries the assistant message id without a user message', () => {
    const send = vi.fn()
    const socket = new ThreadsSocket({
      opened: Promise.resolve(),
      send,
      close: vi.fn(),
      onMessage: vi.fn(),
      onClose: vi.fn(),
    })

    socket.retryResponse('thread-1', 'assistant-2', {
      model: 'openai:gpt-fast',
      reasoningEffort: 'high',
      fastMode: true,
    })

    expect(JSON.parse(send.mock.calls[0][0])).toEqual({
      type: 'generate_response',
      data: {
        threadId: 'thread-1',
        userMessage: null,
        retryOfMessageId: 'assistant-2',
        model: 'openai:gpt-fast',
        reasoningEffort: 'high',
        fastMode: true,
        source: 'mobile',
      },
    })
  })

  it('edits and resends with the user row id and replacement parts', () => {
    const send = vi.fn()
    const socket = new ThreadsSocket({
      opened: Promise.resolve(),
      send,
      close: vi.fn(),
      onMessage: vi.fn(),
      onClose: vi.fn(),
    })

    socket.replaceMessage(
      'thread-1',
      'user-1',
      [{ type: 'text', text: 'Corrected' }],
      { model: 'openai:gpt-fast', fastMode: false },
    )

    expect(JSON.parse(send.mock.calls[0][0])).toMatchObject({
      type: 'generate_response',
      data: {
        threadId: 'thread-1',
        replaceMessageId: 'user-1',
        model: 'openai:gpt-fast',
        fastMode: false,
        source: 'mobile',
        userMessage: {
          role: 'user',
          parts: [{ type: 'text', text: 'Corrected' }],
        },
      },
    })
  })
})
