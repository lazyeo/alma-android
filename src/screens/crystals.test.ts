import { describe, expect, it } from 'vitest'
import {
  applyMaterialResolutions,
  checklistSaveBody,
  materialUris,
  parseCrystalDetail,
  parseCrystalOverview,
  validationMessage,
} from './crystals'

describe('crystal parsing', () => {
  it('parses snake-case desktop overview rows safely', () => {
    expect(
      parseCrystalOverview({
        contourCount: 35,
        slotCapacity: 3,
        slots: [],
        backpack: [
          {
            id: 'cry_1',
            name: 'alma',
            stage: 'candidate',
            type: null,
            dormant: 0,
            updated_at: 'now',
          },
        ],
        formal: [],
        types: ['entity'],
      }),
    ).toMatchObject({
      contourCount: 35,
      slotCapacity: 3,
      backpack: [{ id: 'cry_1', name: 'alma', dormant: false }],
    })
  })

  it('parses the desktop checklist and realistic material references', () => {
    const detail = parseCrystalDetail({
      id: 'cry_1',
      name: 'alma',
      type: 'entity',
      materials: [
        {
          id: 'm1',
          kind: 'turn',
          source: 'auto',
          createdAt: '2026-10-24T01:00:00Z',
          ref: {
            threadTitle: 'Crystal contract investigation',
            excerpt: 'Each checklist field stores a value and source tags.',
          },
        },
      ],
      checklistSpec: [
        { key: 'definition', label: 'Definition' },
        { key: 'grounding', label: 'Grounding' },
      ],
      checklist: {
        definition: {
          value: 'A grounded definition',
          sources: ['turn:message-1'],
        },
      },
      validation: {
        ready: false,
        missing: ['grounding'],
        conflicted: [],
      },
    })
    expect(detail.materials).toEqual([
      expect.objectContaining({
        id: 'm1',
        title: 'Each checklist field stores a value and source tags.',
        secondary: 'Crystal contract investigation',
      }),
    ])
    expect(detail.checklist).toEqual([
      {
        key: 'definition',
        label: 'Definition',
        complete: true,
        value: 'A grounded definition',
        sources: ['turn:message-1'],
      },
      {
        key: 'grounding',
        label: 'Grounding',
        complete: false,
        value: undefined,
        sources: undefined,
      },
    ])
    expect(detail.checklistRecognized).toBe(true)
  })

  it('parses real turn materials and applies one batched resolve response', () => {
    const detail = parseCrystalDetail({
      id: 'cry_1',
      name: 'alma',
      materials: [
        {
          id: 'm1',
          crystal_id: 'cry_1',
          kind: 'turn',
          ref: { threadId: 'thread-1', anchorId: 'message-7' },
          source: 'auto',
          created_at: '2026-10-24T01:00:00Z',
        },
      ],
    })
    expect(materialUris(detail.materials)).toEqual([
      'alma://thread/thread-1/message/message-7',
    ])
    expect(
      applyMaterialResolutions(detail.materials, [
        {
          uri: 'alma://thread/thread-1/message/message-7',
          kind: 'message',
          id: 'message-7',
          exists: true,
          title: 'Fallback title',
          subtitle: 'user in "Crystal contract investigation"',
          summary: 'Each checklist field stores a value and source tags.',
        },
      ])[0],
    ).toMatchObject({
      title: 'Each checklist field stores a value and source tags.',
      threadTitle: 'Crystal contract investigation',
      threadId: 'thread-1',
      anchorId: 'message-7',
    })
  })

  it('marks missing resolved messages unavailable', () => {
    const detail = parseCrystalDetail({
      id: 'cry_1',
      name: 'alma',
      materials: [
        {
          id: 'm1',
          kind: 'turn',
          ref: { threadId: 'thread-1', anchorId: 'message-7' },
        },
      ],
    })
    expect(
      applyMaterialResolutions(detail.materials, [
        {
          uri: 'alma://thread/thread-1/message/message-7',
          kind: 'message',
          id: 'message-7',
          exists: false,
          title: 'Missing',
        },
      ])[0],
    ).toMatchObject({ title: 'Message unavailable', unavailable: true })
  })

  it('builds the exact desktop per-field checklist body', () => {
    expect(
      checklistSaveBody('definition', {
        value: 'A grounded definition',
        sources: ['user:manual'],
      }),
    ).toEqual({
      field: 'definition',
      value: 'A grounded definition',
      sources: ['user:manual'],
    })
  })

  it('maps server validation keys to human checklist labels', () => {
    expect(
      validationMessage(
        { ready: false, missing: ['type', 'grounding'], conflicted: ['claim'] },
        [
          { key: 'grounding', label: 'Grounding' },
          { key: 'claim', label: 'Core claim' },
        ],
      ),
    ).toBe('Missing: Type, Grounding. Conflicted: Core claim.')
    expect(validationMessage({ ready: true }, [])).toBe('')
  })

  it('guards confirmation until a type is selected', () => {
    expect(validationMessage({ ready: false, missing: ['type'] }, [])).toBe(
      'Missing: Type.',
    )
  })
})
