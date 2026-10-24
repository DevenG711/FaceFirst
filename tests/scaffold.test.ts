import { describe, expect, it } from 'vitest';
import { dictionaries, LOCALES, t, type Dictionary } from '#lib/i18n/index.ts';

function keys(dict: Dictionary, prefix = ''): string[] {
  return Object.entries(dict).flatMap(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    return typeof v === 'string' ? [key] : keys(v, key);
  });
}

describe('scaffold', () => {
  it('resolves the #lib alias and the i18n helper', () => {
    expect(t('en', 'nav.call911')).toBe('Call 911');
    expect(t('en', 'missing.key')).toBe('missing.key');
  });

  it('every locale has exactly the English key set', () => {
    const en = keys(dictionaries.en).sort();
    for (const locale of LOCALES) {
      expect(keys(dictionaries[locale]).sort()).toEqual(en);
    }
  });

  it('home disclaimer matches safety.md exactly in English', () => {
    expect(t('en', 'home.disclaimer')).toBe(
      'FaceFirst is a prototype for demonstration only. It is not a medical device and does not diagnose stroke. Commercial use would require clinical validation and FDA review.'
    );
  });

  it('substitutes {params}', () => {
    expect(t('en', 'nav.call911', { x: 1 })).toBe('Call 911');
  });
});
