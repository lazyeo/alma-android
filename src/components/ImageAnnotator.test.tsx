// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ImageAnnotator } from './ImageAnnotator'

vi.mock('../screens/imageProcessing', () => ({
  encodeImageCanvas: vi.fn(),
}))

afterEach(cleanup)

it('shows edit request fields in edit-request mode', () => {
  render(
    <ImageAnnotator
      source="data:image/png;base64,fixture"
      onDone={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Annotate image' })).toBeTruthy()
  expect(screen.getByRole('textbox', { name: 'Overall note' })).toBeTruthy()
})

it('hides request fields in markup mode', () => {
  render(
    <ImageAnnotator
      source="data:image/png;base64,fixture"
      mode="markup"
      onDone={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
  expect(screen.queryByRole('textbox', { name: 'Overall note' })).toBeNull()
})
