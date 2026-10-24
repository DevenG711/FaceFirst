// Speech scoring for the "S" in BE-FAST. Pure: no DOM, no Web Speech / Web Audio, no Svelte.
// The route records a transcript (Web Speech API) and RMS amplitude samples (AnalyserNode) and passes
// them here as plain data.
import { ACOUSTIC_PARAMS, QUALITY } from '../triage/thresholds.ts';
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

export interface SpeechAudio {
  /** RMS amplitude samples (0–1), one every `sampleMs` ms, recorded while the person spoke. */
  amplitudes: ArrayLike<number>;
  sampleMs: number;
}

export interface SpeechOptions {
  /** Speaking duration from `speechTiming`. If given and below QUALITY.MIN_SPEECH_MS, the result is `poor_quality`. */
  speakingMs?: number;
  /**
   * Amplitude envelope of the attempt. Adds acoustic proxies for slurred speech (see `speechAcoustics`),
   * which can only raise the score, and supplies `speakingMs` when that is not given. An empty
   * recording means the analysis could not run: the word score stands alone.
   */
  audio?: SpeechAudio;
}

/**
 * Speech check. Word error = 1 − (target words recognized in order) / (target words), in [0, 1].
 * Extra words in the transcript are not penalized, so a missing word can only raise the score.
 * With `audio`, the score is `combineSpeechScore(word error, acoustic score)`: never lower than the
 * word error alone. Compare with POPULATION_THRESHOLD.speech.
 *
 * - `transcript` null / undefined (no recognizer, user skipped) → `unavailable`.
 * - Transcript with no words, or too little speech → `poor_quality` (retry or use the caregiver buttons).
 */
export function speechScore(
  transcript: string | null | undefined,
  target: string,
  { speakingMs, audio }: SpeechOptions = {}
): CheckResult {
  const want = words(target);
  if (transcript === null || transcript === undefined || want.length === 0) return unavailable('speech');
  const got = words(transcript);
  if (got.length === 0) return poorQuality('speech');

  const recorded = audio !== undefined && audio.amplitudes.length > 0 ? audio : null;
  const spokenMs = speakingMs ?? (recorded ? speechTiming(recorded.amplitudes, recorded.sampleMs).speakingMs : undefined);
  if (spokenMs !== undefined && !(spokenMs >= QUALITY.MIN_SPEECH_MS)) return poorQuality('speech');

  const wordError = 1 - lcs(got, want) / want.length;
  const acoustics = recorded ? speechAcoustics(recorded.amplitudes, recorded.sampleMs, want.length) : null;
  return okResult('speech', acoustics ? combineSpeechScore(wordError, acoustics.score) : wordError, null);
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

/** Root-mean-square of one block of audio samples (e.g. an AnalyserNode time-domain frame). 0 if empty. */
export function rms(samples: ArrayLike<number>): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i]! * samples[i]!;
  return Math.sqrt(sum / samples.length);
}

// --- Acoustic proxies for slurred / effortful speech (dysarthria) ---
// UNCALIBRATED, NOT a validated slur detector. Three crude signals from the amplitude envelope,
// each mapped to [0, 1] with higher = more abnormal, using ACOUSTIC_PARAMS. They can only ever
// add to the speech score; nothing here can lower it or report speech as fine.

export interface SpeechAcoustics {
  /** Target words per second of voiced time. Low = slow, effortful speech. */
  wordsPerSecond: number;
  /** Share of the speech span (first to last voiced sample) spent in pauses of at least QUALITY.MIN_PAUSE_MS. */
  pauseRatio: number;
  /** Longest such pause, ms. */
  longestPauseMs: number;
  /** Coefficient of variation (std / mean) of voiced amplitudes. Low = flat, under-modulated speech. */
  envelopeCv: number;
  /** Weighted average of the three sub-scores, in [0, 1]. Higher = more abnormal. */
  score: number;
}

/** 0 at or before `ok`, 1 at or past `bad`, linear between; works whichever way `bad` lies. */
function ramp(value: number, ok: number, bad: number): number {
  const t = (value - ok) / (bad - ok);
  return Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0;
}

/**
 * Acoustic abnormality of one attempt from its RMS amplitude envelope. `targetWords` is the number of
 * words the person was asked to say. Returns null when there is nothing to analyze (no voiced sample,
 * invalid `sampleMs` or no target words); null adds no finding.
 */
export function speechAcoustics(
  amplitudes: ArrayLike<number>,
  sampleMs: number,
  targetWords: number
): SpeechAcoustics | null {
  if (!(sampleMs > 0) || !Number.isFinite(sampleMs) || !(targetWords > 0)) return null;
  const voiced = (a: number) => Number.isFinite(a) && a > QUALITY.SILENCE_LEVEL;

  let first = -1;
  let last = -1;
  for (let i = 0; i < amplitudes.length; i++) {
    if (!voiced(amplitudes[i]!)) continue;
    if (first < 0) first = i;
    last = i;
  }
  if (first < 0) return null;

  // Pauses use the same rule as speechTiming: a silent run of at least QUALITY.MIN_PAUSE_MS.
  const levels: number[] = [];
  let pausedSamples = 0;
  let longestRun = 0;
  let run = 0;
  for (let i = first; i <= last; i++) {
    const a = amplitudes[i]!;
    if (!voiced(a)) {
      run++;
      continue;
    }
    if (run * sampleMs >= QUALITY.MIN_PAUSE_MS) {
      pausedSamples += run;
      longestRun = Math.max(longestRun, run);
    }
    run = 0;
    levels.push(a);
  }

  const mean = levels.reduce((s, a) => s + a, 0) / levels.length;
  const variance = levels.reduce((s, a) => s + (a - mean) ** 2, 0) / levels.length;

  const wordsPerSecond = targetWords / ((levels.length * sampleMs) / 1000);
  const pauseRatio = pausedSamples / (last - first + 1);
  const longestPauseMs = longestRun * sampleMs;
  const envelopeCv = Math.sqrt(variance) / mean;

  const P = ACOUSTIC_PARAMS;
  const rate = ramp(wordsPerSecond, P.MIN_WORDS_PER_SEC, P.SLOW_WORDS_PER_SEC);
  const pause = Math.max(
    ramp(pauseRatio, P.MAX_PAUSE_RATIO, P.HIGH_PAUSE_RATIO),
    ramp(longestPauseMs, P.LONG_PAUSE_MS, P.VERY_LONG_PAUSE_MS)
  );
  const envelope = ramp(envelopeCv, P.MIN_ENVELOPE_CV, P.FLAT_ENVELOPE_CV);
  const score =
    (P.WEIGHT_RATE * rate + P.WEIGHT_PAUSE * pause + P.WEIGHT_ENVELOPE * envelope) /
    (P.WEIGHT_RATE + P.WEIGHT_PAUSE + P.WEIGHT_ENVELOPE);

  return { wordsPerSecond, pauseRatio, longestPauseMs, envelopeCv, score };
}

/**
 * Final speech score: min(1, word error + ACOUSTIC_WEIGHT × acoustic score). Monotonic in both inputs
 * and never below the word error, so acoustic analysis can only add a finding, never clear one.
 */
export function combineSpeechScore(wordError: number, acoustic: number): number {
  const extra = Number.isFinite(acoustic) ? Math.max(0, acoustic) : 0;
  return Math.min(1, wordError + ACOUSTIC_PARAMS.ACOUSTIC_WEIGHT * extra);
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
