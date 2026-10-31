import { describe, expect, it } from 'vitest'
import {
  HERDR_MAX_UPLOAD_BYTES,
  buildHerdrPrompt,
  planHerdrUpload,
} from './attachments'

describe('buildHerdrPrompt', () => {
  it('quotes paths containing spaces before appending trimmed text', () => {
    expect(
      buildHerdrPrompt(
        ['/tmp/plain.txt', '/tmp/folder/hello world.pdf'],
        '  review these  ',
      ),
    ).toBe('/tmp/plain.txt "/tmp/folder/hello world.pdf" review these')
  })

  it('omits empty prompt segments', () => {
    expect(buildHerdrPrompt(['/tmp/a.txt'], '   ')).toBe('/tmp/a.txt')
    expect(buildHerdrPrompt([], ' hello ')).toBe('hello')
  })
})

describe('planHerdrUpload', () => {
  it('uses one relay request for files within the conservative frame budget', () => {
    expect(planHerdrUpload(5 * 1024 * 1024)).toBe('single')
  })

  it('chunks larger desktop-supported files', () => {
    expect(planHerdrUpload(6 * 1024 * 1024)).toBe('chunked')
    expect(planHerdrUpload(HERDR_MAX_UPLOAD_BYTES)).toBe('chunked')
  })

  it('rejects files above the desktop 30 MB limit', () => {
    expect(planHerdrUpload(HERDR_MAX_UPLOAD_BYTES + 1)).toBe('tooLarge')
  })
})
