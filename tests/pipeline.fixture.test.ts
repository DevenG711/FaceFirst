// End-to-end pipeline fixtures: synthetic MediaPipe clips -> mapFrames -> metric -> triage -> verdict.
//
// This is the layer the other suites do not cover. metricChecks.property.test.ts proves the maths;
// vision-mapping.test.ts proves one frame maps to the right fields. Here we take a whole seeded CLIP
// (dozens of frames, the shape MediaPipe actually emits) and assert the REAL end result: the metric's
// CheckResult, and then the triage state a user would actually see.
//
// The thresholds are UNCALIBRATED placeholders (thresholds.ts), so these tests pin BEHAVIOUR against
// the current thresholds, not clinical truth. If a threshold changes deliberately, update the clip
// magnitudes here in the same commit — that is the point: the fixture makes a threshold change visible.
import { describe, expect, it } from 'vitest';
import { faceFrameFromResult, armFrameFromResult } from '#lib/vision/mapFrames.ts';
import { faceAsymmetry } from '#lib/metrics/faceAsymmetry.ts';
import { armDrift } from '#lib/metrics/armDrift.ts';
import { speechScore } from '#lib/metrics/speech.ts';
import { triage } from '#lib/triage/engine.ts';
import { POPULATION_THRESHOLD } from '#lib/triage/thresholds.ts';
import type { CheckResult, TriageInput } from '#lib/triage/types.ts';
import { FACE_SCENARIOS, ARM_SCENARIOS } from './fixtures/clips.ts';

const W = 640;
const H = 480;

function runFace(clip: ReturnType<(typeof FACE_SCENARIOS)[keyof typeof FACE_SCENARIOS]>): CheckResult {
  const frames = clip.map((r) => (r === null ? null : faceFrameFromResult(r, W, H)));
  return faceAsymmetry(frames, { mirrored: false });
}

function runArm(clip: ReturnType<(typeof ARM_SCENARIOS)[keyof typeof ARM_SCENARIOS]>): CheckResult {
  const frames = clip.map((r) => (r === null ? null : armFrameFromResult(r, W, H)));
  return armDrift(frames, { mirrored: false });
}

/** Build a triage input where only the given check varies; the rest are healthy/empty. */
function triageWith(check: CheckResult): TriageInput {
  const healthy = (id: 'face' | 'arm' | 'speech'): CheckResult => ({ id, status: 'ok', score: 0, side: null });
  const checks = {
    face: healthy('face'),
    arm: healthy('arm'),
    speech: healthy('speech'),
  };
  checks[check.id] = check;
  return { checks, beFast: {}, caregiverReports: [], baseline: null };
}

// ---------------------------------------------------------------------------
// FACE
// ---------------------------------------------------------------------------
describe('face pipeline fixtures', () => {
  it('healthy face: low score, below threshold, triage does NOT call 911', () => {
    const res = runFace(FACE_SCENARIOS.healthy());
    expect(res.status).toBe('ok');
    expect(res.score!).toBeLessThan(POPULATION_THRESHOLD.face);
    expect(triage(triageWith(res)).state).not.toBe('CALL_911_NOW');
  });

  it('left droop: flagged above threshold and triage escalates to CALL_911_NOW', () => {
    const res = runFace(FACE_SCENARIOS.leftDroop());
    expect(res.status).toBe('ok');
    expect(res.score!).toBeGreaterThan(POPULATION_THRESHOLD.face);
    expect(res.side).not.toBeNull();
    expect(triage(triageWith(res)).state).toBe('CALL_911_NOW');
  });

  it('right droop: flagged, and reports the OPPOSITE side to left droop', () => {
    const left = runFace(FACE_SCENARIOS.leftDroop());
    const right = runFace(FACE_SCENARIOS.rightDroop());
    expect(right.status).toBe('ok');
    expect(right.score!).toBeGreaterThan(POPULATION_THRESHOLD.face);
    expect(right.side).not.toBeNull();
    expect(left.side).not.toBeNull();
    expect(right.side).not.toBe(left.side);
  });

  it('healthy but shaky: jitter does NOT fake a droop', () => {
    const res = runFace(FACE_SCENARIOS.healthyNoisy());
    expect(res.status).toBe('ok');
    expect(res.score!).toBeLessThan(POPULATION_THRESHOLD.face);
  });

  it('poor tracking: too few frames -> poor_quality -> RETRY_CAPTURE', () => {
    const res = runFace(FACE_SCENARIOS.poorTracking());
    expect(res.status).toBe('poor_quality');
    expect(triage(triageWith(res)).state).toBe('RETRY_CAPTURE');
  });

  it('ambiguous (subject turning): split readings do NOT pass as clean — routed to RETRY_CAPTURE', () => {
    const res = runFace(FACE_SCENARIOS.ambiguousTurning());
    // Enough frames, but direction disagreement + small median triggers the consistency gate.
    expect(res.status).toBe('poor_quality');
    expect(triage(triageWith(res)).state).toBe('RETRY_CAPTURE');
  });

  it('a clear droop is NEVER suppressed by the consistency gate', () => {
    // Regression guard: the gate must not swallow a real escalation.
    const res = runFace(FACE_SCENARIOS.leftDroop());
    expect(res.status).toBe('ok');
    expect(res.score!).toBeGreaterThan(POPULATION_THRESHOLD.face);
  });
});

// ---------------------------------------------------------------------------
// ARM
// ---------------------------------------------------------------------------
describe('arm pipeline fixtures', () => {
  it('healthy arms: steady, below threshold, no escalation', () => {
    const res = runArm(ARM_SCENARIOS.healthy());
    expect(res.status).toBe('ok');
    expect(res.score!).toBeLessThan(POPULATION_THRESHOLD.arm);
    expect(triage(triageWith(res)).state).not.toBe('CALL_911_NOW');
  });

  it('left drift: flagged above threshold and triage escalates', () => {
    const res = runArm(ARM_SCENARIOS.leftDrift());
    expect(res.status).toBe('ok');
    expect(res.score!).toBeGreaterThan(POPULATION_THRESHOLD.arm);
    expect(res.side).not.toBeNull();
    expect(triage(triageWith(res)).state).toBe('CALL_911_NOW');
  });

  it('right drift: flagged, opposite side to left drift', () => {
    const left = runArm(ARM_SCENARIOS.leftDrift());
    const right = runArm(ARM_SCENARIOS.rightDrift());
    expect(right.status).toBe('ok');
    expect(right.score!).toBeGreaterThan(POPULATION_THRESHOLD.arm);
    expect(right.side).not.toBe(left.side);
  });

  it('both arms tire equally: difference ~0, NOT flagged', () => {
    const res = runArm(ARM_SCENARIOS.bothTireEqually());
    expect(res.status).toBe('ok');
    expect(res.score!).toBeLessThan(POPULATION_THRESHOLD.arm);
    expect(triage(triageWith(res)).state).not.toBe('CALL_911_NOW');
  });

  it('low visibility: wrists gated out -> poor_quality -> RETRY_CAPTURE', () => {
    const res = runArm(ARM_SCENARIOS.lowVisibility());
    expect(res.status).toBe('poor_quality');
    expect(triage(triageWith(res)).state).toBe('RETRY_CAPTURE');
  });

  it('frames bunched at the start (subject left frame): span gate -> poor_quality, not a half-measured drift', () => {
    const res = runArm(ARM_SCENARIOS.bunchedAtStart());
    expect(res.status).toBe('poor_quality');
    expect(triage(triageWith(res)).state).toBe('RETRY_CAPTURE');
  });
});

// ---------------------------------------------------------------------------
// SPEECH (already plain-data; fixtures assert realistic transcripts end to end)
// ---------------------------------------------------------------------------
describe('speech pipeline fixtures', () => {
  const TARGET = 'the sky is blue in cincinnati';

  it('perfect repeat: score 0, not flagged', () => {
    const res = speechScore(TARGET, TARGET, { speakingMs: 3000 });
    expect(res.status).toBe('ok');
    expect(res.score!).toBe(0);
    expect(triage(triageWith(res)).state).not.toBe('CALL_911_NOW');
  });

  it('badly slurred (half the words missing): flagged, escalates', () => {
    const res = speechScore('the sky', TARGET, { speakingMs: 3000 });
    expect(res.status).toBe('ok');
    expect(res.score!).toBeGreaterThan(POPULATION_THRESHOLD.speech);
    expect(triage(triageWith(res)).state).toBe('CALL_911_NOW');
  });

  it('too little speech: poor_quality -> RETRY_CAPTURE', () => {
    const res = speechScore('the', TARGET, { speakingMs: 200 });
    expect(res.status).toBe('poor_quality');
    expect(triage(triageWith(res)).state).toBe('RETRY_CAPTURE');
  });

  it('no recognizer: unavailable, and triage can only be MORE cautious (never 911 from this alone)', () => {
    const res = speechScore(null, TARGET);
    expect(res.status).toBe('unavailable');
    // unavailable is neither flagged nor poor_quality from an ok-with-no-score; it falls through safely.
    expect(['CANNOT_RULE_OUT', 'RETRY_CAPTURE']).toContain(triage(triageWith(res)).state);
  });
});
