import { describe, expect, it } from 'vitest'
import {
  createTranslator,
  formatMessage,
  localeTag,
  parseLanguagePreference,
  resolveLanguage,
} from './core'

describe('language preference', () => {
  it('accepts only the stored system, en, and zh values', () => {
    expect(parseLanguagePreference('system')).toBe('system')
    expect(parseLanguagePreference('en')).toBe('en')
    expect(parseLanguagePreference('zh')).toBe('zh')
    expect(parseLanguagePreference(null)).toBe('system')
    expect(parseLanguagePreference('zh-CN')).toBe('system')
    expect(parseLanguagePreference('"en"')).toBe('system')
  })
})

describe('language resolution', () => {
  it('uses an explicit choice regardless of the system languages', () => {
    expect(resolveLanguage('en', ['zh-CN'])).toBe('en')
    expect(resolveLanguage('zh', ['en-US'])).toBe('zh')
  })

  it('maps any zh system language to Simplified Chinese', () => {
    expect(resolveLanguage('system', ['zh-CN'])).toBe('zh')
    expect(resolveLanguage('system', ['zh'])).toBe('zh')
    expect(resolveLanguage('system', ['zh-TW'])).toBe('zh')
    expect(resolveLanguage('system', ['ZH-hans-CN'])).toBe('zh')
  })

  it('takes the first supported system language and falls back to English', () => {
    expect(resolveLanguage('system', ['fr-FR', 'zh-CN'])).toBe('zh')
    expect(resolveLanguage('system', ['en-US', 'zh-CN'])).toBe('en')
    expect(resolveLanguage('system', ['fr-FR', 'de'])).toBe('en')
    expect(resolveLanguage('system', [])).toBe('en')
  })

  it('does not mistake look-alike tags for Chinese', () => {
    expect(resolveLanguage('system', ['zu-ZA'])).toBe('en')
  })

  it('exposes the BCP 47 tag used for html lang and Intl', () => {
    expect(localeTag('en')).toBe('en')
    expect(localeTag('zh')).toBe('zh-CN')
  })
})

describe('message formatting', () => {
  it('interpolates named parameters and leaves unknown ones visible', () => {
    expect(formatMessage('en', 'Rename {name}', { name: 'Mac' })).toBe(
      'Rename Mac',
    )
    expect(formatMessage('en', '{a} of {b}', { a: 1, b: 3 })).toBe('1 of 3')
    expect(formatMessage('en', 'Hi {missing}', {})).toBe('Hi {missing}')
  })

  it('selects plural forms by count with the language rules', () => {
    const files = { one: '{count} file', other: '{count} files' }
    expect(formatMessage('en', files, { count: 1 })).toBe('1 file')
    expect(formatMessage('en', files, { count: 0 })).toBe('0 files')
    expect(formatMessage('en', files, { count: 4 })).toBe('4 files')
    expect(formatMessage('zh', { other: '{count} 个文件' }, { count: 1 })).toBe(
      '1 个文件',
    )
  })
})

describe('translator', () => {
  const en = {
    common: { cancel: 'Cancel', greet: 'Hello {name}' },
    files: { count: { one: '{count} file', other: '{count} files' } },
  } as const
  const zh = {
    common: { cancel: '取消', greet: '你好，{name}' },
    files: { count: { other: '{count} 个文件' } },
  }

  it('looks up dotted keys in the active language', () => {
    const t = createTranslator(en, 'en')
    expect(t('common.cancel')).toBe('Cancel')
    expect(t('common.greet', { name: 'Ana' })).toBe('Hello Ana')
    expect(t('files.count', { count: 2 })).toBe('2 files')
    const tz = createTranslator<typeof en>(zh, 'zh')
    expect(tz('common.greet', { name: 'Ana' })).toBe('你好，Ana')
    expect(tz('files.count', { count: 1 })).toBe('1 个文件')
  })

  it('fails loudly on a missing key instead of rendering blank copy', () => {
    const t = createTranslator(en, 'en') as unknown as (key: string) => string
    expect(() => t('common.nope')).toThrow(/common\.nope/)
  })
})
