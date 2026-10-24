// Personal baseline: storage helpers, signed metrics, the engine's signed comparison, and the whole
// pipeline (synthetic clip -> metric -> stored baseline -> triage). Guards safety.md: a baseline can
// only ADD sensitivity; it never lowers urgency or removes a population flag.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { faceAsymmetry } from '#lib/metrics/faceAsymmetry.ts';
import { armDrift } from '#lib/metrics/armDrift.ts';
import { toAnatomicalSigned } from '#lib/metrics/geometry.ts';
import { armFrameFromResult, faceFrameFromResult } from '#lib/vision/mapFrames.ts';
import { triage } from '#lib/triage/engine.ts';
import { resultCopy } from '#lib/triage/copy.ts';
import { findBannedWords } from '#lib/triage/bannedWords.ts';
import { LOCALES } from '#lib/i18n/index.ts';
import { BASELINE_DEVIATION_THRESHOLD, POPULATION_THRESHOLD } from '#lib/triage/thresholds.ts';
import { CHECK_IDS, type CheckId, type CheckResult, type TriageInput } from '#lib/triage/types.ts';
import {
  baselineFromResults,
  entryFromResult,
  parseBaseline,
  toTriageBaseline,
  type StoredBaseline,
} from '#lib/storage/baselines.ts';
import { arbScore, arbTriageInput } from './arbitraries.ts';
import { armClip, faceClip, type ArmClipSpec, type FaceClipSpec } from './fixtures/clips.ts';

const RUNS = { numRuns: 1000 };
const FEW = { numRuns: 150 };
const W = 640;
const H = 480;

const runFace = (spec: FaceClipSpec, mirrored = false) =>
  faceAsymmetry(
    faceClip(spec).map((r) => (r ? faceFrameFromResult(r, W, H) : null)),
    { mirrored }
  );
const runArm = (spec: ArmClipSpec, mirrored = false) =>
  armDrift(
    armClip(spec).map((r) => (r ? armFrameFromResult(r, W, H) : null)),
    { mirrored }
  );

const unavailable = (id: CheckId): CheckResult => ({ id, status: 'unavailable', score: null, side: null });

function inputWith(checks: Partial<Record<CheckId, CheckResult>>, b: StoredBaseline | null): TriageInput {
  return {
    checks: { face: unavailable('face'), arm: unavailable('arm'), speech: unavailable('speech'), ...checks },
    beFast: {},
    caregiverReports: [],
    ...toTriageBaseline(b),
  };
}

// ---------- generators ----------

/** Gives every ok face/arm check a signed value consistent with its score (|signed| = score). */
const arbSignedInput: fc.Arbitrary<TriageInput> = fc
  .tuple(arbTriageInput, fc.boolean(), fc.boolean())
  .map(([input, faceNeg, armNeg]) => {
    const checks = { ...input.checks };
    for (const [id, neg] of [['face', faceNeg], ['arm', armNeg]] as const) {
      const c = checks[id];
      if (c.status === 'ok' && c.score !== null) checks[id] = { ...c, signed: neg ? -c.score : c.score };
    }
    return { ...input, checks };
  });

const arbSignedBaseline = fc.record(
  {
    face: fc.double({ min: -2, max: 2, noNaN: true }),
    arm: fc.double({ min: -2, max: 2, noNaN: true }),
  },
  { requiredKeys: [] }
);

// ---------- engine ----------

describe('engine: signed baseline comparison', () => {
  it('B1: adding signed baseline values never lowers urgency (vs none, and vs unsigned only)', () => {
    fc.assert(
      fc.property(arbSignedInput, arbSignedBaseline, (input, signed) => {
        const none = triage({ ...input, baseline: null, baselineSigned: null }).urgency;
        const unsignedOnly = triage({ ...input, baselineSigned: null }).urgency;
        const both = triage({ ...input, baselineSigned: signed }).urgency;
        expect(unsignedOnly).toBeGreaterThanOrEqual(none);
        expect(both).toBeGreaterThanOrEqual(unsignedOnly);
        expect(triage({ ...input, baseline: null, baselineSigned: signed }).urgency).toBeGreaterThanOrEqual(none);
      }),
      RUNS
    );
  });

  it('B2: a population flag is never removed or relabelled by any baseline', () => {
    fc.assert(
      fc.property(arbSignedInput, arbSignedBaseline, (input, signed) => {
        const r = triage({ ...input, baselineSigned: signed });
        for (const id of CHECK_IDS) {
          const c = input.checks[id];
          if (c.status === 'ok' && c.score !== null && c.score > POPULATION_THRESHOLD[id]) {
            expect(r.reasons).toContainEqual({ kind: 'check_flagged', check: id, side: c.side, basis: 'population' });
          }
        }
      }),
      RUNS
    );
  });

  it('B3: a check matching its own baseline exactly is not flagged by the baseline', () => {
    fc.assert(
      fc.property(fc.constantFrom('face' as const, 'arm' as const), fc.double({ min: -2, max: 2, noNaN: true }), (id, s) => {
        const score = Math.abs(s);
        fc.pre(score <= POPULATION_THRESHOLD[id]);
        const check: CheckResult = { id, status: 'ok', score, side: s > 0 ? 'left' : s < 0 ? 'right' : null, signed: s };
        const r = triage(inputWith({ [id]: check }, { version: 1, recordedAt: 0, checks: { [id]: { score, signed: s } } }));
        expect(r.reasons).toEqual([]);
        expect(r.state).toBe('CANNOT_RULE_OUT');
        expect(r.baselineComparisons).toEqual([
          { check: id, baseline: score, current: score, deviation: 0, signedBaseline: s, signedCurrent: s },
        ]);
      }),
      RUNS
    );
  });

  it('B4: a signed change larger than the threshold always flags, naming the side that changed', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('face' as const, 'arm' as const),
        fc.double({ min: -0.1, max: 0.1, noNaN: true }),
        fc.double({ min: 0.001, max: 0.2, noNaN: true }),
        fc.boolean(),
        (id, base, extra, towardLeft) => {
          const delta = (BASELINE_DEVIATION_THRESHOLD[id] + extra) * (towardLeft ? 1 : -1);
          const now = base + delta;
          const score = Math.abs(now);
          const check: CheckResult = { id, status: 'ok', score, side: now > 0 ? 'left' : now < 0 ? 'right' : null, signed: now };
          const b: StoredBaseline = { version: 1, recordedAt: 0, checks: { [id]: { score: Math.abs(base), signed: base } } };
          const r = triage(inputWith({ [id]: check }, b));
          expect(r.state).toBe('CALL_911_NOW');
          const reason = r.reasons.find((x) => x.kind === 'check_flagged' && x.check === id);
          expect(reason).toBeDefined();
          if (score <= POPULATION_THRESHOLD[id]) {
            expect(reason).toEqual({ kind: 'check_flagged', check: id, side: towardLeft ? 'left' : 'right', basis: 'baseline' });
          }
        }
      ),
      RUNS
    );
  });

  it('catches a change of side that comparing unsigned scores alone would miss', () => {
    const s = POPULATION_THRESHOLD.face / 2; // a mild usual asymmetry, below every flag on its own
    const usual: StoredBaseline = { version: 1, recordedAt: 0, checks: { face: { score: s, signed: s } } };
    const flipped: CheckResult = { id: 'face', status: 'ok', score: s, side: 'right', signed: -s };

    // Same unsigned score as the baseline: the old unsigned comparison sees no change.
    expect(triage({ ...inputWith({ face: flipped }, usual), baselineSigned: null }).state).toBe('CANNOT_RULE_OUT');
    // With the signed comparison the change of side is caught.
    const r = triage(inputWith({ face: flipped }, usual));
    expect(r.state).toBe('CALL_911_NOW');
    expect(r.reasons).toEqual([{ kind: 'check_flagged', check: 'face', side: 'right', basis: 'baseline' }]);
    expect(r.baselineComparisons[0]!.deviation).toBeCloseTo(2 * s, 12);
  });

  it('baseline reasons render in every locale with no banned words and no raw keys', () => {
    fc.assert(
      fc.property(arbSignedInput, arbSignedBaseline, fc.constantFrom(...LOCALES), (input, signed, locale) => {
        const copy = resultCopy(triage({ ...input, baselineSigned: signed }), locale);
        for (const text of [copy.title, ...copy.body, ...copy.actions]) {
          expect(findBannedWords(text)).toEqual([]);
          expect(text).not.toMatch(/\{\w+\}|result\./);
        }
      }),
      RUNS
    );
  });
});

// ---------- metrics ----------

describe('metrics: signed output', () => {
  it('toAnatomicalSigned keeps the magnitude and flips with mirroring', () => {
    fc.assert(
      fc.property(fc.double({ min: -10, max: 10, noNaN: true }), (v) => {
        expect(Math.abs(toAnatomicalSigned(v, false))).toBe(Math.abs(v));
        expect(toAnatomicalSigned(v, true)).toBe(v === 0 ? 0 : -toAnatomicalSigned(v, false));
      }),
      RUNS
    );
  });

  const arbDrop = fc.double({ min: 0, max: 0.05, noNaN: true });

  it('face: |signed| equals score and its sign names the reported side', () => {
    fc.assert(
      fc.property(arbDrop, arbDrop, fc.boolean(), fc.integer({ min: 1, max: 1e6 }), (l, r, mirrored, seed) => {
        const res = runFace({ leftMouthDrop: l, rightMouthDrop: r, jitter: 0.001, seed }, mirrored);
        if (res.status !== 'ok') return;
        expect(Math.abs(res.signed!)).toBeCloseTo(res.score!, 12);
        if (res.signed! > 0) expect(res.side).toBe('left');
        if (res.signed! < 0) expect(res.side).toBe('right');
      }),
      FEW
    );
  });

  it('arm: |signed| equals score and its sign names the reported side', () => {
    fc.assert(
      fc.property(arbDrop, arbDrop, fc.boolean(), fc.integer({ min: 1, max: 1e6 }), (l, r, mirrored, seed) => {
        const res = runArm({ leftWristDrift: l * 4, rightWristDrift: r * 4, jitter: 0.001, seed }, mirrored);
        if (res.status !== 'ok') return;
        expect(Math.abs(res.signed!)).toBeCloseTo(res.score!, 12);
        if (res.signed! > 0) expect(res.side).toBe('left');
        if (res.signed! < 0) expect(res.side).toBe('right');
      }),
      FEW
    );
  });

  it('poor_quality and unavailable results carry no signed value and cannot become a baseline', () => {
    const poor = runFace({ dropRate: 1 });
    expect(poor.status).toBe('poor_quality');
    expect(poor.signed).toBeUndefined();
    expect(entryFromResult(poor)).toBeNull();
    expect(entryFromResult(unavailable('arm'))).toBeNull();
  });
});

// ---------- storage ----------

describe('storage: baseline records', () => {
  const valid: StoredBaseline = {
    version: 1,
    recordedAt: 1_700_000_000_000,
    checks: { face: { score: 0.03, signed: -0.03 }, arm: { score: 0.01, signed: 0.01 } },
  };

  it('round-trips a valid record (including through structured clone, as IndexedDB does)', () => {
    expect(parseBaseline(valid)).toEqual(valid);
    expect(parseBaseline(structuredClone(valid))).toEqual(valid);
  });

  it('rejects malformed records instead of guessing', () => {
    for (const bad of [
      null,
      undefined,
      42,
      'baseline',
      {},
      { ...valid, version: 2 },
      { ...valid, recordedAt: 'today' },
      { ...valid, checks: {} },
      { ...valid, checks: { face: { score: -1, signed: -1 } } },
      { ...valid, checks: { face: { score: Number.NaN, signed: 0 } } },
      { ...valid, checks: { face: { score: 0.1 } } },
      { ...valid, checks: { face: 'x' } },
      { ...valid, checks: { speech: { score: 0.1, signed: 0.1 } } }, // speech is never baselined
    ]) {
      expect(parseBaseline(bad)).toBeNull();
    }
  });

  it('never throws on arbitrary input, and anything it accepts is well-formed', () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const b = parseBaseline(raw);
        if (b === null) return;
        expect(b.version).toBe(1);
        for (const e of Object.values(b.checks)) {
          expect(Number.isFinite(e!.score) && e!.score >= 0 && Number.isFinite(e!.signed)).toBe(true);
        }
      }),
      RUNS
    );
  });

  it('builds only from ok readings and maps to both triage inputs', () => {
    const face: CheckResult = { id: 'face', status: 'ok', score: 0.04, side: 'right', signed: -0.04 };
    const arm: CheckResult = { id: 'arm', status: 'poor_quality', score: null, side: null };
    const speech: CheckResult = { id: 'speech', status: 'ok', score: 0.1, side: null };
    const b = baselineFromResults([face, arm, speech], 5);
    expect(b).toEqual({ version: 1, recordedAt: 5, checks: { face: { score: 0.04, signed: -0.04 } } });
    expect(toTriageBaseline(b)).toEqual({ baseline: { face: 0.04 }, baselineSigned: { face: -0.04 } });
    expect(baselineFromResults([arm], 5)).toBeNull();
    expect(toTriageBaseline(null)).toEqual({ baseline: null, baselineSigned: null });
  });

  it('optional: with no saved baseline (or the toggle off) triage is exactly the population-only result', () => {
    fc.assert(
      fc.property(arbSignedInput, (input) => {
        const populationOnly = triage({ ...input, baseline: null, baselineSigned: undefined });
        expect(triage({ ...input, ...toTriageBaseline(null) })).toEqual(populationOnly);
        expect(populationOnly.baselineComparisons).toEqual([]);
        expect(populationOnly.reasons.every((r) => r.kind !== 'check_flagged' || r.basis === 'population')).toBe(true);
      }),
      RUNS
    );
  });

  it('a baseline built from any readings never lowers urgency', () => {
    fc.assert(
      fc.property(arbSignedInput, arbScore, arbScore, fc.boolean(), (input, f, a, neg) => {
        const b = baselineFromResults(
          [
            { id: 'face', status: 'ok', score: f, side: null, signed: neg ? -f : f },
            { id: 'arm', status: 'ok', score: a, side: null, signed: a },
          ],
          0
        );
        const without = triage({ ...input, baseline: null, baselineSigned: null });
        expect(triage({ ...input, ...toTriageBaseline(b) }).urgency).toBeGreaterThanOrEqual(without.urgency);
      }),
      RUNS
    );
  });
});

// ---------- end to end: clip -> metric -> stored baseline -> triage ----------

describe('pipeline: compare a capture with the person\'s own baseline', () => {
  // A mild, natural one-sided asymmetry, below every population flag on its own.
  const USUAL: FaceClipSpec = { leftMouthDrop: 0.012, jitter: 0.0015 };

  function enroll(spec: FaceClipSpec, seed: number): StoredBaseline {
    const reading = runFace({ ...spec, seed });
    expect(reading.status).toBe('ok');
    const b = parseBaseline(structuredClone(baselineFromResults([reading], 0)));
    expect(b).not.toBeNull();
    return b!;
  }

  it('the usual asymmetry alone does not trip the population threshold (so the baseline is what matters)', () => {
    const r = runFace({ ...USUAL, seed: 1 });
    expect(r.status).toBe('ok');
    expect(r.score!).toBeLessThan(POPULATION_THRESHOLD.face);
    expect(r.score!).toBeGreaterThan(BASELINE_DEVIATION_THRESHOLD.face / 2);
  });

  it('a new capture of the same face (different noise) is not flagged against its baseline', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const b = enroll(USUAL, seed);
      const now = runFace({ ...USUAL, seed: seed + 1000 });
      const r = triage(inputWith({ face: now }, b));
      expect(r.reasons, `seed ${seed}`).toEqual([]);
      expect(r.state).toBe('CANNOT_RULE_OUT');
      expect(r.baselineComparisons[0]!.deviation).toBeLessThan(BASELINE_DEVIATION_THRESHOLD.face);
    }
  });

  it('the same mild droop on the OTHER side is flagged only because of the baseline', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const b = enroll(USUAL, seed);
      const now = runFace({ leftMouthDrop: 0, rightMouthDrop: 0.012, jitter: 0.0015, seed: seed + 1000 });
      expect(now.status).toBe('ok');
      // Without the baseline this capture is below every flag.
      expect(triage(inputWith({ face: now }, null)).state).toBe('CANNOT_RULE_OUT');
      // With it, the change is caught and the side that changed is named.
      const r = triage(inputWith({ face: now }, b));
      expect(r.state, `seed ${seed}`).toBe('CALL_911_NOW');
      expect(r.reasons).toEqual([{ kind: 'check_flagged', check: 'face', side: now.side, basis: 'baseline' }]);
    }
  });

  it('a mild new droop on a usually symmetric face is flagged against its baseline', () => {
    const b = enroll({ jitter: 0.0015 }, 7);
    const now = runFace({ rightMouthDrop: 0.014, jitter: 0.0015, seed: 8 });
    expect(now.status).toBe('ok');
    expect(now.score!).toBeLessThan(POPULATION_THRESHOLD.face);
    expect(triage(inputWith({ face: now }, null)).state).toBe('CANNOT_RULE_OUT');
    expect(triage(inputWith({ face: now }, b)).state).toBe('CALL_911_NOW');
  });

  it('a strong droop is flagged on the population threshold whatever the baseline says', () => {
    const lopsided = enroll({ rightMouthDrop: 0.05 }, 3); // a baseline that is itself very uneven
    const now = runFace({ rightMouthDrop: 0.05, seed: 4 });
    expect(now.score!).toBeGreaterThan(POPULATION_THRESHOLD.face);
    const r = triage(inputWith({ face: now }, lopsided));
    expect(r.state).toBe('CALL_911_NOW');
    expect(r.reasons[0]).toMatchObject({ kind: 'check_flagged', check: 'face', basis: 'population' });
  });
});
