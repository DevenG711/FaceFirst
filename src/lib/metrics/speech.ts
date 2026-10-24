// Speech scoring for the "S" in BE-FAST. Pure: no DOM, no Web Speech / Web Audio, no Svelte.
// The route records a transcript (Web Speech API) and RMS amplitude samples (AnalyserNode) and passes
// them here as plain data.
import { QUALITY } from '../triage/thresholds.ts';
import type { CheckResult } from '../triage/types.ts';
import { okResult, poorQuality, unavailable } from './checkResult.ts';

/** Lowercase, strip accents and punctuation, split on whitespace. "¿Está bien?" → ["esta", "bien"]. */
export function words(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // combining accents
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // punctuation and symbols
    .split(/\s+/)
    .filter(Boolean);
}

/** Length of the longest common subsequence of two word lists. O(n·m) with one reused row. */
function lcs(a: readonly string[], b: readonly string[]): number {
  const row = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0; // row[j-1] from the previous i
    for (let j = 1; j <= b.length; j++) {
      const up = row[j]!;
      row[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(up, row[j - 1]!);
      diag = up;
    }
  }
  return row[b.length]!;
}

export interface SpeechOptions {
  /** Speaking duration from `speechTiming`. If given and below QUALITY.MIN_SPEECH_MS, the result is `poor_quality`. */
  speakingMs?: number;
}

/**
 * Speech check. Score = 1 − (target words recognized in order) / (target words), in [0, 1].
 * Compare with POPULATION_THRESHOLD.speech. Extra words in the transcript are not penalized, so a
 * missing word can only raise the score.
 *
 * - `transcript` null / undefined (no recognizer, user skipped) → `unavailable`.
 * - Transcript with no words, or too little speech → `poor_quality` (retry or use the caregiver buttons).
 */
export function speechScore(
  transcript: string | null | undefined,
  target: string,
  { speakingMs }: SpeechOptions = {}
): CheckResult {
  const want = words(target);
  if (transcript === null || transcript === undefined || want.length === 0) return unavailable('speech');
  const got = words(transcript);
  if (got.length === 0) return poorQuality('speech');
  if (speakingMs !== undefined && !(speakingMs >= QUALITY.MIN_SPEECH_MS)) return poorQuality('speech');
  return okResult('speech', 1 - lcs(got, want) / want.length, null);
}

export interface SpeechTiming {
  /** Total time above QUALITY.SILENCE_LEVEL, in ms. */
  speakingMs: number;
  /** Silences of at least QUALITY.MIN_PAUSE_MS between two stretches of speech (leading/trailing silence ignored). */
  pauseCount: number;
}

/**
 * Speaking duration and pause count from RMS amplitude samples (0–1) taken every `sampleMs` ms.
 * Non-finite samples count as silence. Invalid `sampleMs` gives zeros.
 */
export function speechTiming(amplitudes: ArrayLike<number>, sampleMs: number): SpeechTiming {
  if (!(sampleMs > 0) || !Number.isFinite(sampleMs)) return { speakingMs: 0, pauseCount: 0 };
  let speaking = 0;
  let pauses = 0;
  let silentRun = 0;
  let spokeYet = false;
  for (let i = 0; i < amplitudes.length; i++) {
    const a = amplitudes[i]!;
    if (Number.isFinite(a) && a > QUALITY.SILENCE_LEVEL) {
      if (spokeYet && silentRun * sampleMs >= QUALITY.MIN_PAUSE_MS) pauses++;
      speaking++;
      silentRun = 0;
      spokeYet = true;
    } else {
      silentRun++;
    }
  }
  return { speakingMs: speaking * sampleMs, pauseCount: pauses };
}

// --- UI-facing simple scorer (used by the speech check route) ---
// Accent-sensitive bag-of-words error: share of expected words missing from what was heard.
// Kept separate from speechScore (which the triage engine uses) because the route needs a bare
// number and preserves accents ("esta" != "está").
const uiWords = (s: string): string[] =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * 1 − word accuracy, in [0, 1]: the share of expected words missing from what was heard
 * (0 = every word heard). Accent-sensitive. Used by the speech check route.
 */
export function speechErrorScore(expected: string, heard: string): number {
  const want = uiWords(expected);
  if (want.length === 0) return 0;

  const pool = new Map<string, number>();
  for (const w of uiWords(heard)) pool.set(w, (pool.get(w) ?? 0) + 1);

  let matched = 0;
  for (const w of want) {
    const left = pool.get(w) ?? 0;
    if (left > 0) {
      matched++;
      pool.set(w, left - 1);
    }
  }
  return 1 - matched / want.length;
}
