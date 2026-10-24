// Tiny i18n helper: dot-path lookup + {param} substitution.
// All user-facing copy lives in the locale JSON files (see .kiro/steering/tech.md).
import en from './en.json';
import es from './es.json';
import pt from './pt.json';

export type Locale = 'en' | 'es' | 'pt';
export const LOCALES: readonly Locale[] = ['en', 'es', 'pt'];
export const DEFAULT_LOCALE: Locale = 'en';

export type Dictionary = { [key: string]: string | Dictionary };

export const dictionaries: Record<Locale, Dictionary> = { en, es, pt };

/** Resolve a dot-namespaced key. Falls back to English, then to the key itself. */
export function t(
  locale: Locale,
  key: string,
  params: Record<string, string | number> = {}
): string {
  const raw = lookup(dictionaries[locale], key) ?? lookup(dictionaries.en, key) ?? key;
  return raw.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in params ? String(params[name]) : m
  );
}

function lookup(dict: Dictionary, key: string): string | undefined {
  let node: string | Dictionary | undefined = dict;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}
