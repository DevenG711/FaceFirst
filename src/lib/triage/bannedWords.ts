// Banned reassuring words for result.* / card.* copy. See .kiro/steering/safety.md §1.
// Matching semantics MUST stay identical to scripts/safety-lint.mjs:
//   - Unicode-aware whole-word match: "abnormal" does not match "normal", "sanó" does not match "sano".
//   - Case-insensitive.
//   - Text is NFC-normalized and curly apostrophes become "'" before matching.

import { LOCALES, type Locale } from '#lib/i18n/index.ts';
import bannedByLocale from './bannedWords.json';

export interface BannedMatch {
  word: string;
  /** UTF-16 offset into the normalized text (same as the input unless it contained decomposed accents). */
  index: number;
}

const normalize = (s: string): string => s.normalize('NFC').replace(/[‘’ʼ]/g, "'");
const escape = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const compile = (words: string[]) =>
  [...new Set(words.map(normalize))].map((word) => ({
    word,
    re: new RegExp(`(?<![\\p{L}\\p{N}])${escape(word)}(?![\\p{L}\\p{N}])`, 'giu'),
  }));

const lists = bannedByLocale as unknown as Record<Locale, string[]>;
const byLocale = Object.fromEntries(LOCALES.map((l) => [l, compile(lists[l])])) as Record<
  Locale,
  ReturnType<typeof compile>
>;
// Union of every locale's list: what scripts/safety-lint.mjs checks every string against.
const all = compile(LOCALES.flatMap((l) => lists[l]));

/**
 * Returns every banned word occurrence in `text`, sorted by position.
 * With `locale`, only that locale's list is checked; without it, every locale's list is
 * checked (the stricter mode, matching scripts/safety-lint.mjs).
 */
export function findBannedWords(text: string, locale?: Locale): BannedMatch[] {
  const t = normalize(text);
  const matches: BannedMatch[] = [];
  for (const { word, re } of locale ? byLocale[locale] : all) {
    for (const m of t.matchAll(re)) matches.push({ word, index: m.index! });
  }
  return matches.sort((a, b) => a.index - b.index);
}
