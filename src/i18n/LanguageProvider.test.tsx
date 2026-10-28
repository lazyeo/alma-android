// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LanguageSettings } from '../screens/LanguageSettings'
import { LanguageProvider, useT } from './LanguageProvider'
import { LANGUAGE_STORAGE_KEY } from './preference'
import { getLanguage, setLanguage, t } from './runtime'

function Probe() {
  const translate = useT()
  return (
    <p>
      <span data-testid="hook">{translate('common.cancel')}</span>
      <span data-testid="runtime">{t('common.cancel')}</span>
    </p>
  )
}

function setSystemLanguages(languages: string[]) {
  Object.defineProperty(navigator, 'languages', {
    configurable: true,
    get: () => languages,
  })
}

beforeEach(() => {
  // This jsdom build has no Web Storage; install a minimal in-memory one.
  const values = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
      clear: () => values.clear(),
    },
  })
  setSystemLanguages(['en-US'])
})
afterEach(() => {
  cleanup()
  setLanguage('en')
})

describe('LanguageProvider', () => {
  it('follows a Chinese system language and sets html lang', () => {
    setSystemLanguages(['zh-CN', 'en'])
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    )
    expect(screen.getByTestId('hook').textContent).toBe('取消')
    expect(screen.getByTestId('runtime').textContent).toBe('取消')
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('prefers the stored explicit choice over the system language', () => {
    setSystemLanguages(['zh-CN'])
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'en')
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    )
    expect(screen.getByTestId('hook').textContent).toBe('Cancel')
    expect(document.documentElement.lang).toBe('en')
  })

  it('switches immediately from the Settings language sheet and persists it', () => {
    render(
      <LanguageProvider>
        <LanguageSettings />
        <Probe />
      </LanguageProvider>,
    )
    expect(
      screen.getByRole('button', { name: /Language/ }).textContent,
    ).toContain('System default')
    fireEvent.click(screen.getByRole('button', { name: /Language/ }))
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /简体中文/ }))
    })
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('zh')
    expect(getLanguage()).toBe('zh')
    expect(screen.getByTestId('hook').textContent).toBe('取消')
    expect(screen.getByRole('button', { name: /语言/ }).textContent).toContain(
      '简体中文',
    )
    expect(document.documentElement.lang).toBe('zh-CN')
  })

  it('re-resolves a system preference when the browser languages change', () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    )
    expect(screen.getByTestId('hook').textContent).toBe('Cancel')
    setSystemLanguages(['zh-Hans-CN'])
    act(() => {
      window.dispatchEvent(new Event('languagechange'))
    })
    expect(screen.getByTestId('hook').textContent).toBe('取消')
  })
})
