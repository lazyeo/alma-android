import { describe, expect, it, vi } from 'vitest'
import { closeEditorAfterAcceptedSend } from './composerEditorSend'

describe('expanded composer send completion', () => {
  it('closes after a message is sent', async () => {
    const close = vi.fn()

    await expect(closeEditorAfterAcceptedSend(true, close)).resolves.toBe(true)

    expect(close).toHaveBeenCalledOnce()
  })

  it('closes after a message is queued', async () => {
    const close = vi.fn()

    await expect(
      closeEditorAfterAcceptedSend(Promise.resolve(true), close),
    ).resolves.toBe(true)

    expect(close).toHaveBeenCalledOnce()
  })

  it('stays open when sending or queueing fails', async () => {
    const close = vi.fn()

    await expect(
      closeEditorAfterAcceptedSend(Promise.resolve(false), close),
    ).resolves.toBe(false)

    expect(close).not.toHaveBeenCalled()
  })
})
