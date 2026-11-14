// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HERDR_MAX_UPLOAD_BYTES } from '../herdr/attachments'
import type { ComposerAttachment } from '../screens/attachmentUpload'
import { MAX_RELAY_UPLOAD_BYTES } from '../screens/imageProcessing'
import { ComposerAttachments } from './ComposerAttachments'

// The Fold7 report: a tall screenshot whose original is over the 6 MB relay
// cap re-encodes to a 916x2048 JPEG of 93,676 bytes (the bytes the desktop
// finally received). The private sample stays out of the public tree; its
// shape is what matters here.
const SAMPLE_BYTES = 93_676
const downscaled = vi.hoisted(() => ({ calls: [] as Array<[File, number]> }))

vi.mock('../screens/imageProcessing', async (original) => ({
  ...(await original<typeof import('../screens/imageProcessing')>()),
  downscaleImage: vi.fn(async (file: File, byteLimit: number) => {
    downscaled.calls.push([file, byteLimit])
    return {
      bytes: new Uint8Array(SAMPLE_BYTES),
      mediaType: 'image/jpeg',
      previewUrl: 'blob:downscaled',
    }
  }),
}))

const tooLarge = (name: string) =>
  `${name} is too large for the mobile relay. Uploads must fit in a single encrypted frame, so the mobile limit is 6 MB.`

function bigFile(name: string, type: string, bytes: number) {
  return new File([new Uint8Array(bytes)], name, { type })
}

function pick(
  input: 'photos' | 'files',
  file: File,
  props: Partial<Parameters<typeof ComposerAttachments>[0]> = {},
) {
  const onChange = vi.fn<(value: ComposerAttachment[]) => void>()
  const onError = vi.fn<(value: string) => void>()
  const { container } = render(
    <ComposerAttachments
      attachments={[]}
      onChange={onChange}
      onError={onError}
      {...props}
    />,
  )
  const inputs =
    container.querySelectorAll<HTMLInputElement>('input[type="file"]')
  // photos, camera, files — in render order.
  const target = input === 'photos' ? inputs[0] : inputs[2]
  fireEvent.change(target, { target: { files: [file] } })
  return { onChange, onError }
}

describe('ComposerAttachments.pick size limits', () => {
  beforeEach(() => {
    downscaled.calls = []
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    })
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('re-encodes a photo whose original is over 6 MB instead of refusing it', async () => {
    const original = bigFile('33332', 'image/png', MAX_RELAY_UPLOAD_BYTES + 1)
    const { onChange, onError } = pick('photos', original)

    // Settle on either outcome (pick clears the error with '' first).
    await waitFor(() =>
      expect(
        onChange.mock.calls.length +
          onError.mock.calls.filter(([message]) => message).length,
      ).toBeGreaterThan(0),
    )
    expect(onError).not.toHaveBeenCalledWith(tooLarge('33332'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(downscaled.calls).toEqual([[original, MAX_RELAY_UPLOAD_BYTES]])
    const [attachment] = onChange.mock.calls[0][0]
    expect(attachment).toMatchObject({
      kind: 'image',
      name: '33332.jpg',
      mediaType: 'image/jpeg',
    })
    if (!('pending' in attachment)) throw new Error('expected a pending image')
    expect(attachment.pending.blob.size).toBe(SAMPLE_BYTES)
  })

  it('still refuses a file over 6 MB that is sent as is', async () => {
    const { onChange, onError } = pick(
      'files',
      bigFile('archive.zip', 'application/zip', MAX_RELAY_UPLOAD_BYTES + 1),
    )
    await waitFor(() =>
      expect(onError).toHaveBeenLastCalledWith(tooLarge('archive.zip')),
    )
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps the raw cap for images that are not re-encoded', async () => {
    const { onChange, onError } = pick(
      'photos',
      bigFile('huge.png', 'image/png', HERDR_MAX_UPLOAD_BYTES + 1),
      { maxFileBytes: HERDR_MAX_UPLOAD_BYTES, preprocessImages: false },
    )
    await waitFor(() =>
      expect(onError).toHaveBeenLastCalledWith(
        expect.stringContaining('huge.png is too large'),
      ),
    )
    expect(onChange).not.toHaveBeenCalled()
    expect(downscaled.calls).toEqual([])
  })
})
