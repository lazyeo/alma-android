// Pure i18n logic: preference parsing, language resolution, and message
// formatting. No React, storage, or globals so it is testable in isolation.

export type Language = 'en' | 'zh'
export type LanguagePreference = 'system' | Language

export const LANGUAGES: readonly Language[] = ['en', 'zh']

// Autonyms: each language is always named in itself, never translated.
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: 'English',
  zh: '简体中文',
}

/** Plural copy keyed by `Intl.PluralRules` category; `other` is required. */
export type PluralForms = { readonly one?: string; readonly other: string }
export type MessageLeaf = string | PluralForms
export type MessageTree = { readonly [key: string]: MessageLeaf | MessageTree }
export type MessageParams = Readonly<Record<string, string | number>>

export function parseLanguagePreference(
  raw: string | null | undefined,
): LanguagePreference {
  return raw === 'en' || raw === 'zh' ? raw : 'system'
}

/** The first system language Alma supports wins; anything else is English. */
export function resolveLanguage(
  preference: LanguagePreference,
  systemLanguages: readonly string[],
): Language {
  if (preference !== 'system') return preference
  for (const tag of systemLanguages) {
    const primary = tag.toLowerCase().split(/[-_]/)[0]
    if (primary === 'zh') return 'zh'
    if (primary === 'en') return 'en'
  }
  return 'en'
}

export function localeTag(language: Language) {
  return language === 'zh' ? 'zh-CN' : 'en'
}

export function isPluralForms(value: unknown): value is PluralForms {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as Record<string, unknown>).other === 'string'
  )
}

const pluralRules = new Map<Language, Intl.PluralRules>()

function pluralCategory(language: Language, count: number) {
  let rules = pluralRules.get(language)
  if (!rules) {
    rules = new Intl.PluralRules(localeTag(language))
    pluralRules.set(language, rules)
  }
  return rules.select(count)
}

export function formatMessage(
  language: Language,
  message: MessageLeaf,
  params: MessageParams = {},
) {
  let template: string
  if (typeof message === 'string') template = message
  else {
    const category = pluralCategory(language, Number(params.count ?? 0))
    template =
      (message as Record<string, string | undefined>)[category] ?? message.other
  }
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

// ---- Typed keys and parameters -------------------------------------------

type LeafPaths<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends MessageLeaf
    ? `${Prefix}${K}`
    : LeafPaths<T[K], `${Prefix}${K}.`>
}[keyof T & string]

type ValueAt<
  T,
  Path extends string,
> = Path extends `${infer Head}.${infer Rest}`
  ? Head extends keyof T
    ? ValueAt<T[Head], Rest>
    : never
  : Path extends keyof T
    ? T[Path]
    : never

type Placeholders<S> = S extends `${string}{${infer Name}}${infer Rest}`
  ? Name | Placeholders<Rest>
  : never

type LeafParams<V> = V extends PluralForms
  ? { count: number } & Record<
      Exclude<Placeholders<V['other']> | Placeholders<V['one']>, 'count'>,
      string | number
    >
  : Record<Placeholders<V>, string | number>

type ParamsArgs<V> = V extends PluralForms
  ? [params: LeafParams<V>]
  : [Placeholders<V>] extends [never]
    ? []
    : [params: LeafParams<V>]

export type KeyOf<T> = LeafPaths<T>
export type Translator<T> = <K extends KeyOf<T>>(
  key: K,
  ...params: ParamsArgs<ValueAt<T, K>>
) => string

/** Same keys as the source catalog, with every leaf free to hold any text. */
export type CatalogShape<T> = {
  readonly [K in keyof T]: T[K] extends string
    ? string
    : T[K] extends PluralForms
      ? PluralForms
      : CatalogShape<T[K]>
}

export function lookupMessage(messages: MessageTree, key: string): MessageLeaf {
  let node: MessageTree | MessageLeaf | undefined = messages
  for (const part of key.split('.')) {
    if (!node || typeof node === 'string' || isPluralForms(node)) {
      node = undefined
      break
    }
    node = (node as MessageTree)[part]
  }
  if (typeof node === 'string' || isPluralForms(node)) return node
  throw new Error(`Missing translation: ${key}`)
}

export function createTranslator<T extends MessageTree>(
  messages: T | CatalogShape<T>,
  language: Language,
): Translator<T> {
  return ((key: string, params?: MessageParams) =>
    formatMessage(
      language,
      lookupMessage(messages as MessageTree, key),
      params,
    )) as Translator<T>
}
