// Properties of the three metric checks (face, arm, speech) plus one integration test each through triage().
// geometry.ts properties live in metrics.property.test.ts.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { armDrift, type ArmFrameInput } from '#lib/metrics/armDrift.ts';
import {
  FACE_BLENDSHAPES,
  faceAsymmetry,
  pickBlendshapes,
  type FaceBlendshapes,
  type FaceFrameInput,
} from '#lib/metrics/faceAsymmetry.ts';
import { anatomicalSideOfA, anatomicalSideOfB, BLENDSHAPE_LEFT_IS_SIDE, type Point } from '#lib/metrics/geometry.ts';
import { speechScore, speechTiming, words } from '#lib/metrics/speech.ts';
import { triage } from '#lib/triage/engine.ts';
import { POPULATION_THRESHOLD, QUALITY } from '#lib/triage/thresholds.ts';
import type { CheckResult, TriageInput } from '#lib/triage/types.ts';

const RUNS = { numRuns: 1000 };
const FEW = { numRuns: 200 }; // for properties that build long frame sequences

// ---------- shared helpers ----------

/** A uniform similarity transform: scale, roll, translate. Applied to canonical points to make "image" points. */
interface Pose {
  s: number;
  theta: number;
  t: Point;
}
const IDENTITY: Pose = { s: 1, theta: 0, t: { x: 0, y: 0 } };
const arbPose: fc.Arbitrary<Pose> = fc.record({
  s: fc.double({ min: 20, max: 2000, noNaN: true }),
  theta: fc.double({ min: -Math.PI, max: Math.PI, noNaN: true }),
  t: fc.record({
    x: fc.double({ min: -2000, max: 2000, noNaN: true }),
    y: fc.double({ min: -2000, max: 2000, noNaN: true }),
  }),
});
function place(p: Point, { s, theta, t }: Pose): Point {
  const c = Math.cos(theta);
  const n = Math.sin(theta);
  return { x: s * (p.x * c - p.y * n) + t.x, y: s * (p.x * n + p.y * c) + t.y };
}
const unit = fc.double({ min: 0, max: 1, noNaN: true });
const empty = (id: 'arm' | 'speech' | 'face'): CheckResult => ({ id, status: 'unavailable', score: null, side: null });
function triageOnly(check: CheckResult): ReturnType<typeof triage> {
  const input: TriageInput = {
    checks: { face: empty('face'), arm: empty('arm'), speech: empty('speech'), [check.id]: check },
    beFast: {},
    caregiverReports: [],
    baseline: null,
  };
  return triage(input);
}
function expectWellFormed(r: CheckResult) {
  if (r.status === 'ok') {
    expect(r.score).not.toBeNull();
    expect(Number.isFinite(r.score)).toBe(true);
    expect(r.score!).toBeGreaterThanOrEqual(0);
  } else {
    expect(r.score).toBeNull();
    expect(r.side).toBeNull();
  }
}

// ---------- face ----------

/** Canonical face: eyes at (∓0.5, 0) (33 = A = image-left, 263 = B), mouth corners below, y down. */
interface CanonFace {
  a: Point; // mouth 61
  b: Point; // mouth 291
  bs: FaceBlendshapes;
}
const arbBlendshapes = fc.record(
  Object.fromEntries(FACE_BLENDSHAPES.map((n) => [n, unit])) as Record<keyof FaceBlendshapes, fc.Arbitrary<number>>
);
const arbCanonFace: fc.Arbitrary<CanonFace> = fc.record({
  a: fc.record({ x: fc.double({ min: -0.6, max: -0.2, noNaN: true }), y: fc.double({ min: 0.6, max: 1.2, noNaN: true }) }),
  b: fc.record({ x: fc.double({ min: 0.2, max: 0.6, noNaN: true }), y: fc.double({ min: 0.6, max: 1.2, noNaN: true }) }),
  bs: arbBlendshapes,
});
const arbFaceSeq = fc.array(arbCanonFace, { minLength: QUALITY.MIN_FACE_FRAMES, maxLength: QUALITY.MIN_FACE_FRAMES + 15 });

function faceImage(f: CanonFace, pose: Pose): FaceFrameInput {
  return {
    eye33: place({ x: -0.5, y: 0 }, pose),
    eye263: place({ x: 0.5, y: 0 }, pose),
    mouth61: place(f.a, pose),
    mouth291: place(f.b, pose),
    blendshapes: { ...f.bs },
  };
}
const faceSeq = (fs: CanonFace[], pose: Pose) => fs.map((f) => faceImage(f, pose));

/** Perfectly symmetric face: B mirrors A, every Left blendshape equals its Right. */
function symmetric(f: CanonFace): CanonFace {
  const bs = { ...f.bs };
  for (const n of ['mouthSmile', 'mouthFrown', 'eyeBlink', 'browDown'] as const) bs[`${n}Right`] = bs[`${n}Left`];
  return { a: f.a, b: { x: -f.a.x, y: f.a.y }, bs };
}

describe('faceAsymmetry', () => {
  it('score >= 0, and null (with no side) unless status is ok', () => {
    const maybe = fc.option(arbCanonFace, { nil: null });
    fc.assert(
      fc.property(fc.array(maybe, { maxLength: QUALITY.MIN_FACE_FRAMES + 10 }), arbPose, fc.boolean(), (fs, pose, mirrored) => {
        expectWellFormed(faceAsymmetry(fs.map((f) => (f ? faceImage(f, pose) : null)), { mirrored }));
      }),
      FEW
    );
  });

  it('is invariant to translation, scale and roll', () => {
    fc.assert(
      fc.property(arbFaceSeq, arbPose, fc.boolean(), (fs, pose, mirrored) => {
        const ref = faceAsymmetry(faceSeq(fs, IDENTITY), { mirrored });
        const moved = faceAsymmetry(faceSeq(fs, pose), { mirrored });
        expect(moved.status).toBe('ok');
        expect(Math.abs(moved.score! - ref.score!)).toBeLessThan(1e-6);
        if (ref.score! > 1e-6) expect(moved.side).toBe(ref.side);
      }),
      FEW
    );
  });

  it('a perfectly symmetric face scores ~0', () => {
    fc.assert(
      fc.property(arbFaceSeq, arbPose, fc.boolean(), (fs, pose, mirrored) => {
        const r = faceAsymmetry(faceSeq(fs.map(symmetric), pose), { mirrored });
        expect(r.status).toBe('ok');
        expect(r.score!).toBeLessThan(1e-6);
      }),
      FEW
    );
  });

  // "Lowering one mouth corner" must mean the corner on the weaker (or tied) side: lowering the corner
  // on the stronger side makes the face more symmetric and SHOULD lower the score.
  it('lowering the weaker side’s mouth corner (in any subset of frames) never lowers the score', () => {
    fc.assert(
      fc.property(
        arbFaceSeq,
        arbPose,
        fc.double({ min: 0, max: 0.5, noNaN: true }),
        fc.infiniteStream(fc.boolean()),
        (fs, pose, d, which) => {
          const before = faceAsymmetry(faceSeq(fs, pose), { mirrored: true });
          const lowerA = before.side !== anatomicalSideOfB(true);
          const lowered = fs.map((f) => {
            if (!which.next().value) return f;
            return lowerA ? { ...f, a: { ...f.a, y: f.a.y + d } } : { ...f, b: { ...f.b, y: f.b.y + d } };
          });
          const after = faceAsymmetry(faceSeq(lowered, pose), { mirrored: true });
          expect(after.score!).toBeGreaterThanOrEqual(before.score! - 1e-9);
        }
      ),
      FEW
    );
  });

  it('drooping the anatomical left corner gives side "left" in both mirrored modes', () => {
    fc.assert(
      fc.property(arbFaceSeq, arbPose, fc.double({ min: 0.05, max: 0.5, noNaN: true }), (fs, pose, d) => {
        const sym = fs.map(symmetric);
        // Mirrored input: the person's left appears on image-left (61). Raw camera: on image-right (291).
        const mirroredDroop = sym.map((f) => ({ ...f, a: { ...f.a, y: f.a.y + d } }));
        const rawDroop = sym.map((f) => ({ ...f, b: { ...f.b, y: f.b.y + d } }));
        expect(faceAsymmetry(faceSeq(mirroredDroop, pose), { mirrored: true }).side).toBe('left');
        expect(faceAsymmetry(faceSeq(rawDroop, pose), { mirrored: false }).side).toBe('left');
      }),
      FEW
    );
  });

  it('a weaker smile is reported on the side its blendshape name refers to, anatomically', () => {
    fc.assert(
      fc.property(arbFaceSeq, fc.boolean(), (fs, mirrored) => {
        const sym = fs.map(symmetric);
        // Lower the blendshape that belongs to side A. BLENDSHAPE_LEFT_IS_SIDE decides which name that is.
        const r1 = faceAsymmetry(
          faceSeq(sym.map((f) => ({ ...f, bs: { ...f.bs, mouthSmileLeft: 0, mouthSmileRight: 1 } })), IDENTITY),
          { mirrored }
        );
        const r2 = faceAsymmetry(
          faceSeq(sym.map((f) => ({ ...f, bs: { ...f.bs, mouthSmileLeft: 1, mouthSmileRight: 0 } })), IDENTITY),
          { mirrored }
        );
        const leftSide = BLENDSHAPE_LEFT_IS_SIDE === 'A' ? anatomicalSideOfA(mirrored) : anatomicalSideOfB(mirrored);
        expect(r1.score!).toBeGreaterThan(0);
        expect(r1.side).toBe(leftSide); // weaker "Left" smile → the side "Left" refers to
        expect(r2.side).not.toBe(leftSide);
      }),
      FEW
    );
  });

  it('too few usable frames gives poor_quality', () => {
    fc.assert(
      fc.property(
        fc.array(arbCanonFace, { maxLength: QUALITY.MIN_FACE_FRAMES - 1 }),
        fc.nat({ max: 20 }),
        fc.boolean(),
        (fs, nulls, mirrored) => {
          const frames = [...faceSeq(fs, IDENTITY), ...Array<null>(nulls).fill(null)];
          expect(faceAsymmetry(frames, { mirrored })).toEqual({ id: 'face', status: 'poor_quality', score: null, side: null });
        }
      ),
      RUNS
    );
  });

  it('frames with missing blendshapes or a degenerate eye line are skipped, not scored', () => {
    fc.assert(
      fc.property(arbFaceSeq, (fs) => {
        const noBs = faceSeq(fs, IDENTITY).map((f) => ({ ...f, blendshapes: {} }));
        expect(faceAsymmetry(noBs, { mirrored: false }).status).toBe('poor_quality');
        const collapsed = faceSeq(fs, IDENTITY).map((f) => ({ ...f, eye263: { ...f.eye33 } }));
        expect(faceAsymmetry(collapsed, { mirrored: false }).status).toBe('poor_quality');
      }),
      FEW
    );
  });

  it('pickBlendshapes keeps exactly the eight names we use', () => {
    const picked = pickBlendshapes([
      { categoryName: 'mouthSmileLeft', score: 0.4 },
      { categoryName: 'jawOpen', score: 0.9 },
    ]);
    expect(picked).toEqual({ mouthSmileLeft: 0.4 });
  });

  it('integration: a large droop on the left goes through triage() to CALL_911_NOW naming the left side', () => {
    const frames = Array.from({ length: QUALITY.MIN_FACE_FRAMES }, () =>
      symmetric({ a: { x: -0.4, y: 0.9 }, b: { x: 0.4, y: 0.9 }, bs: Object.fromEntries(FACE_BLENDSHAPES.map((n) => [n, 0.5])) as FaceBlendshapes })
    ).map((f) => ({ ...f, a: { ...f.a, y: f.a.y + POPULATION_THRESHOLD.face * 3 } }));
    const pose: Pose = { s: 140, theta: 0.2, t: { x: 320, y: 240 } };
    const face = faceAsymmetry(faceSeq(frames, pose), { mirrored: true });
    expect(face).toMatchObject({ status: 'ok', side: 'left' });
    const r = triageOnly(face);
    expect(r.state).toBe('CALL_911_NOW');
    expect(r.reasons).toContainEqual({ kind: 'check_flagged', check: 'face', side: 'left', basis: 'population' });
  });
});

// ---------- arm ----------

/** Canonical arm hold: wrist heights per frame (y down, shoulder-width units), A = 12/16 at x = −0.5, B = 11/15. */
interface ArmSeq {
  yA: number[];
  yB: number[];
}
const N_ARM = QUALITY.MIN_ARM_FRAMES + 20;
// Integer-based so values are spread out: fc.double biases toward ~0, which made every hold flat.
const milli = (min: number, max: number) => fc.integer({ min, max }).map((v) => v / 1000);
/** Start height + a drift ramp (up or down) + per-frame jitter, like a real 10 s hold. */
const arbYs = fc
  .tuple(milli(-300, 300), milli(-200, 600), fc.array(milli(-30, 30), { minLength: N_ARM, maxLength: N_ARM }))
  .map(([start, drift, jitter]) => jitter.map((j, i) => start + (drift * i) / (N_ARM - 1) + j));
const arbArm: fc.Arbitrary<ArmSeq> = fc.record({ yA: arbYs, yB: arbYs });

function armImage({ yA, yB }: ArmSeq, pose: Pose, visibility = 0.99): ArmFrameInput[] {
  return yA.map((ya, i) => ({
    shoulder12: { ...place({ x: -0.5, y: 0 }, pose), visibility },
    shoulder11: { ...place({ x: 0.5, y: 0 }, pose), visibility },
    wrist16: { ...place({ x: -0.45, y: ya }, pose), visibility },
    wrist15: { ...place({ x: 0.45, y: yB[i]! }, pose), visibility },
  }));
}
/** Adds a non-decreasing extra drop over time (a ramp from 0 to d). */
const ramp = (ys: number[], d: number) => ys.map((y, i) => y + (d * i) / (ys.length - 1));

describe('armDrift', () => {
  it('score >= 0, and null (with no side) unless status is ok', () => {
    fc.assert(
      fc.property(arbArm, arbPose, fc.boolean(), fc.double({ min: 0, max: 1, noNaN: true }), (arm, pose, mirrored, vis) => {
        expectWellFormed(armDrift(armImage(arm, pose, vis), { mirrored }));
      }),
      FEW
    );
  });

  it('is invariant to scale, translation and roll', () => {
    fc.assert(
      fc.property(arbArm, arbPose, fc.boolean(), (arm, pose, mirrored) => {
        const ref = armDrift(armImage(arm, IDENTITY), { mirrored });
        const moved = armDrift(armImage(arm, pose), { mirrored });
        expect(moved.status).toBe('ok');
        expect(Math.abs(moved.score! - ref.score!)).toBeLessThan(1e-6);
        if (ref.score! > 1e-6) expect(moved.side).toBe(ref.side);
      }),
      FEW
    );
  });

  it('equal drift on both arms scores ~0', () => {
    fc.assert(
      fc.property(arbYs, arbPose, fc.boolean(), (ys, pose, mirrored) => {
        const r = armDrift(armImage({ yA: ys, yB: ys }, pose), { mirrored });
        expect(r.status).toBe('ok');
        expect(r.score!).toBeLessThan(1e-6);
      }),
      FEW
    );
  });

  // As with the face: extra drift on the arm that already drifts more (or ties). Extra drift on the
  // stronger arm makes the arms more alike and should lower the score.
  it('more drift on the weaker arm never lowers the score', () => {
    fc.assert(
      fc.property(arbArm, arbPose, fc.double({ min: 0, max: 1, noNaN: true }), (arm, pose, d) => {
        const before = armDrift(armImage(arm, pose), { mirrored: true });
        const onA = before.side !== anatomicalSideOfB(true);
        const more = onA ? { ...arm, yA: ramp(arm.yA, d) } : { ...arm, yB: ramp(arm.yB, d) };
        const after = armDrift(armImage(more, pose), { mirrored: true });
        expect(after.score!).toBeGreaterThanOrEqual(before.score! - 1e-9);
      }),
      FEW
    );
  });

  it('the anatomical left arm drifting gives side "left" in both mirrored modes', () => {
    fc.assert(
      // d must beat the largest rise arbYs can generate (0.2 + jitter), or both arms floor to 0 drift.
      fc.property(arbYs, arbPose, milli(300, 1000), (ys, pose, d) => {
        // Mirrored input: the person's left arm is on image-left (16 = A). Raw camera: image-right (15 = B).
        expect(armDrift(armImage({ yA: ramp(ys, d), yB: ys }, pose), { mirrored: true }).side).toBe('left');
        expect(armDrift(armImage({ yA: ys, yB: ramp(ys, d) }, pose), { mirrored: false }).side).toBe('left');
      }),
      FEW
    );
  });

  it('an arm that rises is not drift: one arm rising, the other still, scores 0', () => {
    const still = Array<number>(N_ARM).fill(0);
    const rising = ramp(still, -0.5);
    expect(armDrift(armImage({ yA: rising, yB: still }, IDENTITY), { mirrored: true })).toMatchObject({
      status: 'ok',
      score: 0,
    });
  });

  it('missing wrists, low visibility, or too few frames gives poor_quality', () => {
    fc.assert(
      fc.property(arbArm, arbPose, fc.boolean(), fc.nat({ max: QUALITY.MIN_ARM_FRAMES - 1 }), (arm, pose, mirrored, n) => {
        const frames = armImage(arm, pose);
        const poor = { id: 'arm', status: 'poor_quality', score: null, side: null };
        expect(armDrift(frames.map((f) => ({ ...f, wrist15: null })), { mirrored })).toEqual(poor);
        expect(armDrift(frames.map((f) => ({ ...f, wrist16: null })), { mirrored })).toEqual(poor);
        expect(armDrift(armImage(arm, pose, QUALITY.MIN_LANDMARK_VISIBILITY / 2), { mirrored })).toEqual(poor);
        expect(armDrift(frames.slice(0, n), { mirrored })).toEqual(poor);
        expect(armDrift(frames.map(() => null), { mirrored })).toEqual(poor);
      }),
      FEW
    );
  });

  it('integration: the left arm sinking goes through triage() to CALL_911_NOW naming the left side', () => {
    const still = Array<number>(N_ARM).fill(0);
    const sinking = ramp(still, POPULATION_THRESHOLD.arm * 4);
    const pose: Pose = { s: 180, theta: -0.1, t: { x: 320, y: 200 } };
    const arm = armDrift(armImage({ yA: still, yB: sinking }, pose), { mirrored: false });
    expect(arm).toMatchObject({ status: 'ok', side: 'left' });
    const r = triageOnly(arm);
    expect(r.state).toBe('CALL_911_NOW');
    expect(r.reasons).toContainEqual({ kind: 'check_flagged', check: 'arm', side: 'left', basis: 'population' });
  });
});

// ---------- speech ----------

const arbWord = fc.stringMatching(/^[a-z]{1,8}$/);
const arbSentence = fc.array(arbWord, { minLength: 1, maxLength: 12 });
const arbPunct = fc.constantFrom('', '.', ',', '!', '?', '¿', '¡', ';', ':', '"', '…');

describe('speechScore', () => {
  it('identical text scores 0', () => {
    fc.assert(
      fc.property(arbSentence, (ws) => {
        expect(speechScore(ws.join(' '), ws.join(' '))).toEqual({ id: 'speech', status: 'ok', score: 0, side: null });
      }),
      RUNS
    );
  });

  it('case and punctuation do not matter', () => {
    fc.assert(
      fc.property(arbSentence, fc.array(fc.tuple(fc.boolean(), arbPunct)), fc.string(), (ws, styles, said) => {
        const styled = ws
          .map((w, i) => {
            const [upper, p] = styles[i % Math.max(1, styles.length)] ?? [false, ''];
            return (upper ? w.toUpperCase() : w) + p;
          })
          .join('  ');
        expect(speechScore(styled, ws.join(' ')).score).toBe(0);
        expect(speechScore(said, styled)).toEqual(speechScore(said, ws.join(' ')));
      }),
      RUNS
    );
  });

  it('accents do not matter ("está" matches "esta")', () => {
    expect(speechScore('Você está aqui', 'voce esta aqui').score).toBe(0);
    expect(words('¿Está bien?')).toEqual(['esta', 'bien']);
  });

  it('the score is in [0, 1]', () => {
    fc.assert(
      fc.property(fc.string(), arbSentence, (said, target) => {
        const r = speechScore(said, target.join(' '));
        expectWellFormed(r);
        if (r.status === 'ok') expect(r.score!).toBeLessThanOrEqual(1);
      }),
      RUNS
    );
  });

  it('dropping words from the transcript never lowers the score', () => {
    fc.assert(
      fc.property(arbSentence, fc.array(arbWord, { minLength: 1, maxLength: 12 }), fc.nat(), (target, said, drop) => {
        const fewer = said.filter((_, i) => i !== drop % said.length);
        fc.pre(fewer.length > 0);
        const before = speechScore(said.join(' '), target.join(' '));
        const after = speechScore(fewer.join(' '), target.join(' '));
        expect(after.score!).toBeGreaterThanOrEqual(before.score!);
      }),
      RUNS
    );
  });

  it('an empty transcript gives poor_quality; no transcript gives unavailable', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[\s.,!?¿¡;:…-]*$/), arbSentence, (blank, target) => {
        expect(speechScore(blank, target.join(' ')).status).toBe('poor_quality');
        expect(speechScore(null, target.join(' ')).status).toBe('unavailable');
        expect(speechScore(undefined, target.join(' ')).status).toBe('unavailable');
      }),
      RUNS
    );
  });

  it('too little speaking time gives poor_quality', () => {
    expect(speechScore('the sky is blue', 'the sky is blue', { speakingMs: QUALITY.MIN_SPEECH_MS - 1 }).status).toBe(
      'poor_quality'
    );
    expect(speechScore('the sky is blue', 'the sky is blue', { speakingMs: QUALITY.MIN_SPEECH_MS }).status).toBe('ok');
  });

  it('integration: most words missing goes through triage() to CALL_911_NOW', () => {
    const speech = speechScore('the', 'you can’t teach an old dog new tricks');
    expect(speech.status).toBe('ok');
    expect(speech.score!).toBeGreaterThan(POPULATION_THRESHOLD.speech);
    const r = triageOnly(speech);
    expect(r.state).toBe('CALL_911_NOW');
    expect(r.reasons).toContainEqual({ kind: 'check_flagged', check: 'speech', side: null, basis: 'population' });
  });
});

describe('speechTiming', () => {
  it('pause count and speaking duration are non-negative (and bounded by the recording)', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(unit, fc.constant(Number.NaN))),
        fc.double({ min: -50, max: 200, noNaN: true }),
        (amps, sampleMs) => {
          const { speakingMs, pauseCount } = speechTiming(amps, sampleMs);
          expect(speakingMs).toBeGreaterThanOrEqual(0);
          expect(pauseCount).toBeGreaterThanOrEqual(0);
          expect(Number.isInteger(pauseCount)).toBe(true);
          if (sampleMs > 0) expect(speakingMs).toBeLessThanOrEqual(amps.length * sampleMs);
        }
      ),
      RUNS
    );
  });

  it('counts only pauses between speech, and only long enough ones', () => {
    const ms = 50;
    const loud = 1;
    const quiet = 0;
    const run = (v: number, durMs: number) => Array<number>(Math.ceil(durMs / ms)).fill(v);
    const amps = [
      ...run(quiet, 1000), // leading silence: not a pause
      ...run(loud, 500),
      ...run(quiet, QUALITY.MIN_PAUSE_MS), // a pause
      ...run(loud, 500),
      ...run(quiet, ms), // too short to count
      ...run(loud, 500),
      ...run(quiet, 1000), // trailing silence: not a pause
    ];
    expect(speechTiming(amps, ms)).toEqual({ speakingMs: 1500, pauseCount: 1 });
    expect(speechTiming(Float32Array.from(amps), ms)).toEqual({ speakingMs: 1500, pauseCount: 1 });
  });
});
