// Copy-safety tests: no result text may ever sound reassuring. See .kiro/steering/safety.md §1.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { dictionaries, LOCALES, type Dictionary } from '#lib/i18n/index.ts';
import { findBannedWords } from '#lib/triage/bannedWords.ts';
import { resultCopy, t } from '#lib/triage/copy.ts';
import { triage } from '#lib/triage/engine.ts';
import { arbTriageInput } from './arbitraries.ts';

/** Flattens nested messages into { "result.retry.title": "..." }. */
function flatten(obj: Dictionary, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'string') out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

const isCopyKey = (key: string) => /^(result|card)\./.test(key);

describe('C1: no banned words in the text a user can actually see', () => {
  it.each(LOCALES)('locale %s', (locale) => {
    fc.assert(
      fc.property(arbTriageInput, (input) => {
        const copy = resultCopy(triage(input), locale);
        for (const text of [copy.title, ...copy.body, ...copy.actions]) {
          expect(findBannedWords(text)).toEqual([]);
        }
      }),
      { numRuns: 1000 }
    );
  });
});

describe('C1b: every reachable key resolves (no raw keys or unfilled {placeholders} on screen)', () => {
  it.each(LOCALES)('locale %s', (locale) => {
    fc.assert(
      fc.property(arbTriageInput, (input) => {
        const copy = resultCopy(triage(input), locale);
        for (const key of [copy.titleKey, ...copy.bodyKeys, ...copy.actionKeys]) {
          const text = t(locale, key, copy.params);
          expect(text).not.toBe(key);
          expect(text).not.toMatch(/\{\w+\}|result\./);
        }
      }),
      { numRuns: 1000 }
    );
  });
});

describe('C2: "cannot rule out" and "retry" always tell people to call 911', () => {
  it.each(LOCALES)('locale %s', (locale) => {
    const line = t(locale, 'result.call911Line');
    fc.assert(
      fc.property(arbTriageInput, (input) => {
        const result = triage(input);
        fc.pre(result.state === 'CANNOT_RULE_OUT' || result.state === 'RETRY_CAPTURE');
        const body = resultCopy(result, locale).body.join(' ');
        expect(body).toContain(line);
        expect(body).toContain('911');
      }),
      { numRuns: 1000 }
    );
  });

  it('CANNOT_RULE_OUT carries the exact sentence from safety.md (en)', () => {
    const result = triage({
      checks: {
        face: { id: 'face', status: 'unavailable', score: null, side: null },
        arm: { id: 'arm', status: 'unavailable', score: null, side: null },
        speech: { id: 'speech', status: 'unavailable', score: null, side: null },
      },
      beFast: {},
      caregiverReports: [],
      baseline: null,
    });
    expect(result.state).toBe('CANNOT_RULE_OUT');
    expect(resultCopy(result, 'en').body.join(' ')).toContain(
      'This check cannot rule out a stroke. If you noticed sudden symptoms, call 911.'
    );
  });

  it('a flagged check with a known side names that anatomical side', () => {
    const result = triage({
      checks: {
        face: { id: 'face', status: 'ok', score: 1, side: 'left' },
        arm: { id: 'arm', status: 'unavailable', score: null, side: null },
        speech: { id: 'speech', status: 'unavailable', score: null, side: null },
      },
      beFast: {},
      caregiverReports: [],
      baseline: null,
    });
    expect(resultCopy(result, 'en').params.reasons).toBe('uneven face movement on the left side');
  });
});

describe('C3: the translation files themselves', () => {
  const flat = {
    en: flatten(dictionaries.en),
    es: flatten(dictionaries.es),
    pt: flatten(dictionaries.pt),
  };

  it.each(LOCALES)('%s has no banned words under result.* / card.*', (locale) => {
    for (const [key, text] of Object.entries(flat[locale])) {
      if (isCopyKey(key)) expect(findBannedWords(text), `${locale} [${key}]`).toEqual([]);
    }
  });

  it.each(['es', 'pt'] as const)('%s has every key that en has', (locale) => {
    const missing = Object.keys(flat.en).filter((k) => !(k in flat[locale]));
    expect(missing).toEqual([]);
  });
});

describe('C4: the scanner itself works', () => {
  it('catches "You\'re fine" with a straight apostrophe', () => {
    expect(findBannedWords("You're fine").length).toBeGreaterThan(0);
  });

  it('catches "You’re fine" with a curly apostrophe', () => {
    expect(findBannedWords('You’re fine').length).toBeGreaterThan(0);
  });

  it('does not flag "abnormal"', () => {
    expect(findBannedWords('abnormal')).toEqual([]);
  });

  it('does not flag a longer word that contains a banned word, even with accents', () => {
    expect(findBannedWords('sanó')).toEqual([]);
  });
});
