import { describe, expect, it } from 'vitest'
import { translatorFor } from '../i18n/runtime'
import { almaStatusLine } from './almaStatus'

const en = translatorFor('en')
const zh = translatorFor('zh')
const idle = { running: 0, pendingApprovals: 0 }

describe('almaStatusLine', () => {
  it('says nothing when there is nothing to say', () => {
    expect(almaStatusLine({ generating: false, personal: idle }, en)).toBe(
      undefined,
    )
    expect(
      almaStatusLine(
        { generating: false, personal: idle, vitals: { mood: 'wistful' } },
        en,
      ),
    ).toBe(undefined)
  })

  it('puts a live reply first', () => {
    expect(
      almaStatusLine(
        {
          generating: true,
          personal: { running: 2, pendingApprovals: 3 },
          vitals: { mood: 'happy' },
        },
        en,
      ),
    ).toEqual({ kind: 'thinking', text: 'thinking…' })
    expect(almaStatusLine({ generating: true, personal: idle }, zh)?.text).toBe(
      '在想…',
    )
  })

  it('then things waiting on the user, pluralized', () => {
    expect(
      almaStatusLine(
        { generating: false, personal: { running: 2, pendingApprovals: 1 } },
        en,
      ),
    ).toEqual({ kind: 'approvals', text: '1 thing needs your OK' })
    expect(
      almaStatusLine(
        { generating: false, personal: { running: 0, pendingApprovals: 3 } },
        en,
      )?.text,
    ).toBe('3 things need your OK')
    expect(
      almaStatusLine(
        { generating: false, personal: { running: 0, pendingApprovals: 2 } },
        zh,
      )?.text,
    ).toBe('有 2 件事等你确认')
  })

  it('then background runs', () => {
    expect(
      almaStatusLine(
        { generating: false, personal: { running: 2, pendingApprovals: 0 } },
        en,
      ),
    ).toEqual({ kind: 'working', text: 'working on 2 things' })
    expect(
      almaStatusLine(
        { generating: false, personal: { running: 1, pendingApprovals: 0 } },
        zh,
      )?.text,
    ).toBe('正在处理 1 件事')
  })

  it('falls back to a known mood label', () => {
    expect(
      almaStatusLine(
        { generating: false, personal: idle, vitals: { mood: 'Happy' } },
        en,
      ),
    ).toEqual({ kind: 'mood', text: 'Happy' })
    expect(
      almaStatusLine(
        { generating: false, personal: idle, vitals: { mood: 'sad' } },
        zh,
      )?.text,
    ).toBe('难过')
  })
})
