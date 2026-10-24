// Properties of the acoustic speech proxies: escalate-only, bounded, and the quality gates still hold.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { combineSpeechScore, speechAcoustics, speechScore } from '#lib/metrics/speech.ts';
import { ACOUSTIC_PARAMS, QUALITY } from '#lib/triage/thresholds.ts';

const RUNS = { numRuns: 1000 };
const MS = ACOUSTIC_PARAMS.SAMPLE_MS;
const EPS = 1e-9; // float noise only

const arbWord = fc.stringMatching(/^[a-z]{1,8}$/);
const arbSentence = fc.array(arbWord, { minLength: 1, maxLength: 12 }).map((ws) => ws.join(' '));
const arbUnit = fc.double({ min: 0, max: 1, noNaN: true });
const arbVoiced = fc.double({ min: QUALITY.SILENCE_LEVEL * 1.5, max: 1, noNaN: true });
/** Envelope with speech and silence mixed, any length. */
const arbEnvelope = fc.array(fc.oneof(fc.constant(0), arbVoiced), { minLength: 2, maxLength: 400 });
/** Envelope with enough voiced samples to pass QUALITY.MIN_SPEECH_MS, each followed by 0–12 silent samples. */
const needVoiced = Math.ceil(QUALITY.MIN_SPEECH_MS / MS);
const arbSpokenEnvelope = fc
  .array(fc.tuple(arbVoiced, fc.nat({ max: 12 })), { minLength: needVoiced, maxLength: needVoiced + 60 })
  .map((parts) => parts.flatMap(([level, gap]) => [level, ...Array<number>(gap).fill(0)]));

describe('combineSpeechScore', () => {
  it('stays in [0, 1], never drops below the word error, and only rises with acoustic abnormality', () => {
    fc.assert(
      fc.property(arbUnit, arbUnit, arbUnit, (wordError, a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const low = combineSpeechScore(wordError, lo);
        const high = combineSpeechScore(wordError, hi);
        expect(low).toBeGreaterThanOrEqual(wordError);
        expect(high).toBeGreaterThanOrEqual(low);
        expect(high).toBeLessThanOrEqual(1);
      }),
      RUNS
    );
  });
});

describe('speechAcoustics', () => {
  it('scores in [0, 1], or returns null when there is no voiced sample', () => {
    fc.assert(
      fc.property(fc.array(fc.double({ noNaN: false })), fc.integer({ min: 1, max: 200 }), fc.nat(20), (amps, ms, n) => {
        const a = speechAcoustics(amps, ms, n);
        if (a === null) return;
        expect(a.score).toBeGreaterThanOrEqual(0);
        expect(a.score).toBeLessThanOrEqual(1);
      }),
      RUNS
    );
  });

  it('adding a hesitation inside the speech never lowers the score', () => {
    const minPause = Math.ceil(QUALITY.MIN_PAUSE_MS / MS); // shorter gaps are not hesitations
    fc.assert(
      fc.property(arbEnvelope, fc.nat(), fc.integer({ min: minPause, max: 80 }), arbWordCount(), (amps, at, len, n) => {
        const voicedIdx = amps.flatMap((a, i) => (a > QUALITY.SILENCE_LEVEL ? [i] : []));
        fc.pre(voicedIdx.length >= 2);
        const first = voicedIdx[0]!;
        const last = voicedIdx[voicedIdx.length - 1]!;
        const cut = first + 1 + (at % (last - first));
        const paused = [...amps.slice(0, cut), ...Array<number>(len).fill(0), ...amps.slice(cut)];
        expect(speechAcoustics(paused, MS, n)!.score).toBeGreaterThanOrEqual(speechAcoustics(amps, MS, n)!.score - EPS);
      }),
      RUNS
    );
  });

  it('flattening the loudness of the voiced parts never lowers the score', () => {
    fc.assert(
      fc.property(arbEnvelope, arbWordCount(), (amps, n) => {
        const before = speechAcoustics(amps, MS, n);
        fc.pre(before !== null);
        const voiced = amps.filter((a) => a > QUALITY.SILENCE_LEVEL);
        const mean = voiced.reduce((s, a) => s + a, 0) / voiced.length;
        const flat = amps.map((a) => (a > QUALITY.SILENCE_LEVEL ? mean : a));
        expect(speechAcoustics(flat, MS, n)!.score).toBeGreaterThanOrEqual(before!.score - EPS);
      }),
      RUNS
    );
  });

  it('slowing the whole attempt down never lowers the score', () => {
    fc.assert(
      fc.property(arbEnvelope, fc.integer({ min: 2, max: 4 }), arbWordCount(), (amps, k, n) => {
        const before = speechAcoustics(amps, MS, n);
        fc.pre(before !== null);
        const slow = amps.flatMap((a) => Array<number>(k).fill(a));
        expect(speechAcoustics(slow, MS, n)!.score).toBeGreaterThanOrEqual(before!.score - EPS);
      }),
      RUNS
    );
  });
});

describe('speechScore with audio', () => {
  it('is never lower than the word-only score, and stays in [0, 1]', () => {
    fc.assert(
      fc.property(arbSentence, arbSentence, arbSpokenEnvelope, (said, target, amps) => {
        const withAudio = speechScore(said, target, { audio: { amplitudes: amps, sampleMs: MS } });
        const wordsOnly = speechScore(said, target);
        fc.pre(withAudio.status === 'ok' && wordsOnly.status === 'ok');
        expect(withAudio.score!).toBeGreaterThanOrEqual(wordsOnly.score!);
        expect(withAudio.score!).toBeLessThanOrEqual(1);
      }),
      RUNS
    );
  });

  it('slowing the whole attempt down never lowers the final score', () => {
    fc.assert(
      fc.property(arbSentence, arbSentence, arbSpokenEnvelope, fc.integer({ min: 2, max: 4 }), (said, target, amps, k) => {
        const before = speechScore(said, target, { audio: { amplitudes: amps, sampleMs: MS } });
        fc.pre(before.status === 'ok');
        const slow = amps.flatMap((a) => Array<number>(k).fill(a));
        const after = speechScore(said, target, { audio: { amplitudes: slow, sampleMs: MS } });
        expect(after.status).toBe('ok');
        expect(after.score!).toBeGreaterThanOrEqual(before.score! - EPS);
      }),
      RUNS
    );
  });

  it('too little speech in the recording is poor_quality', () => {
    const maxVoiced = Math.ceil(QUALITY.MIN_SPEECH_MS / MS) - 1; // voiced time stays under MIN_SPEECH_MS
    fc.assert(
      fc.property(
        arbSentence,
        arbSentence,
        fc.array(arbVoiced, { maxLength: maxVoiced }),
        fc.array(fc.constant(0), { minLength: 1, maxLength: 100 }),
        (said, target, voiced, silence) => {
          const amps = [...silence, ...voiced];
          expect(speechScore(said, target, { audio: { amplitudes: amps, sampleMs: MS } }).status).toBe('poor_quality');
        }
      ),
      RUNS
    );
  });

  it('no transcript is unavailable, whatever the recording', () => {
    fc.assert(
      fc.property(arbSentence, fc.array(arbUnit, { maxLength: 200 }), (target, amps) => {
        const audio = { amplitudes: amps, sampleMs: MS };
        expect(speechScore(null, target, { audio }).status).toBe('unavailable');
        expect(speechScore(undefined, target, { audio }).status).toBe('unavailable');
      }),
      RUNS
    );
  });
});

function arbWordCount() {
  return fc.integer({ min: 1, max: 15 });
}
