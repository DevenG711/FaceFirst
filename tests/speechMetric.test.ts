import { describe, expect, it } from 'vitest';
import { speechAcoustics, speechErrorScore, speechScore } from '#lib/metrics/speech.ts';
import { ACOUSTIC_PARAMS } from '#lib/triage/thresholds.ts';

describe('speechErrorScore', () => {
  it('is 0 when every word is heard, ignoring case and punctuation', () => {
    expect(speechErrorScore('The sky is blue today.', 'the sky is blue today')).toBe(0);
  });

  it('is the share of expected words that were missed', () => {
    expect(speechErrorScore('The sky is blue today.', 'the sky blue')).toBeCloseTo(0.4);
  });

  it('is 1 when nothing was heard', () => {
    expect(speechErrorScore('The sky is blue today.', '')).toBe(1);
  });

  it('counts a repeated word only as often as it was heard', () => {
    expect(speechErrorScore('a a b', 'a b')).toBeCloseTo(1 / 3);
  });

  it('matches accented words', () => {
    expect(speechErrorScore('El cielo está azul hoy.', 'el cielo esta azul hoy')).toBeCloseTo(0.2);
    expect(speechErrorScore('O céu está azul hoje.', 'o céu está azul hoje')).toBe(0);
  });
});

describe('acoustic proxies: fluent vs. slow, mushy, over-paused', () => {
  const PHRASE = 'The sky is blue today.';
  const MS = ACOUSTIC_PARAMS.SAMPLE_MS;
  const repeat = (word: number[], times: number) => Array.from({ length: times }, () => word).flat();

  // Five quick words: well-modulated syllables, only short dips between words.
  const fluent = repeat([0.4, 0.15, 0.45, 0.1, 0.35, 0.08, 0], 5);
  // Same five words: slow, flat loudness, and a long gap after each word.
  const slurred = repeat([...Array<number>(16).fill(0.2), ...Array<number>(12).fill(0)], 5);

  it('a fluent attempt adds nothing to a perfect word score', () => {
    expect(speechAcoustics(fluent, MS, 5)!.score).toBe(0);
    expect(speechScore('the sky is blue today', PHRASE, { audio: { amplitudes: fluent, sampleMs: MS } })).toEqual({
      id: 'speech',
      status: 'ok',
      score: 0,
      side: null,
    });
  });

  it('a slow, mushy, over-paused attempt scores higher, even with every word right', () => {
    const fluentScore = speechScore('the sky is blue today', PHRASE, { audio: { amplitudes: fluent, sampleMs: MS } });
    const slurredScore = speechScore('the sky is blue today', PHRASE, { audio: { amplitudes: slurred, sampleMs: MS } });
    expect(slurredScore.status).toBe('ok');
    expect(slurredScore.score!).toBeGreaterThan(fluentScore.score!);

    const a = speechAcoustics(slurred, MS, 5)!;
    expect(a.wordsPerSecond).toBeLessThan(ACOUSTIC_PARAMS.MIN_WORDS_PER_SEC);
    expect(a.pauseRatio).toBeGreaterThan(ACOUSTIC_PARAMS.MAX_PAUSE_RATIO);
    expect(a.envelopeCv).toBeLessThan(ACOUSTIC_PARAMS.MIN_ENVELOPE_CV);
  });

  it('background hum in the gaps does not make fluent speech look slow', () => {
    // The same fluent read, but every gap is filled with steady room noise well above the fixed silence level.
    const noisy = fluent.map((a) => (a === 0 ? 0.05 : a));
    const a = speechAcoustics(noisy, MS, 5)!;
    expect(a.floor).toBeGreaterThan(0.05);
    expect(a.score).toBe(0);
  });

  it('acoustics stack on top of missed words; they never reduce the score', () => {
    const wordsOnly = speechScore('the sky', PHRASE);
    const withAudio = speechScore('the sky', PHRASE, { audio: { amplitudes: slurred, sampleMs: MS } });
    expect(withAudio.score!).toBeGreaterThan(wordsOnly.score!);
  });
});
