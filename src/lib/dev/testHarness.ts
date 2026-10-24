// DEV-ONLY test harness. Exposes `window.facefirst` in the browser console so a human can drive the
// WHOLE real pipeline by hand — set check results, replay synthetic clips through the REAL metrics,
// run the REAL triage engine, and jump to the result — without miming any of it.
//
// This is a TESTING aid, not product code. It is only installed when import.meta.env.DEV is true
// (see +layout.svelte), so it is tree-shaken out of production builds and never ships. It reuses the
// real engine/metrics/stores, so whatever it prints is exactly what the app would do.
//
// Safety note: this only WRITES inputs and reads the engine's own output. It cannot invent a "pass"
// state — the engine has none — and it never touches the 911 control or the result copy.
import { get } from 'svelte/store';
import { goto } from '$app/navigation';
import {
  checks,
  beFast,
  caregiverReports,
  symptomOnset,
  locale,
  setCheck,
  setBeFastAnswer,
  setCaregiverReport,
  unavailableCheck,
} from '#lib/stores/session.ts';
import { triage } from '#lib/triage/engine.ts';
import { resultCopy } from '#lib/triage/copy.ts';
import type {
  Answer,
  BeFastQuestion,
  CaregiverReport,
  CheckId,
  CheckResult,
  Side,
  TriageInput,
  TriageResult,
} from '#lib/triage/types.ts';
import { faceAsymmetry } from '#lib/metrics/faceAsymmetry.ts';
import { armDrift } from '#lib/metrics/armDrift.ts';
import { faceFrameFromResult, armFrameFromResult } from '#lib/vision/mapFrames.ts';
import { FACE_SCENARIOS, ARM_SCENARIOS } from './scenarios.ts';

const W = 640;
const H = 480;

/** Build a CheckResult the engine accepts, with sensible defaults. */
function makeCheck(
  id: CheckId,
  opts: { status?: CheckResult['status']; score?: number | null; side?: Side | null } = {}
): CheckResult {
  const status = opts.status ?? 'ok';
  return {
    id,
    status,
    score: status === 'ok' ? (opts.score ?? 0) : null,
    side: opts.side ?? null,
  };
}

/** Run the real metric over a named synthetic face clip and return the real CheckResult. */
function runFaceScenario(name: keyof typeof FACE_SCENARIOS): CheckResult {
  const frames = FACE_SCENARIOS[name]().map((r) => (r ? faceFrameFromResult(r, W, H) : null));
  return faceAsymmetry(frames, { mirrored: false });
}

/** Run the real metric over a named synthetic arm clip and return the real CheckResult. */
function runArmScenario(name: keyof typeof ARM_SCENARIOS): CheckResult {
  const frames = ARM_SCENARIOS[name]().map((r) => (r ? armFrameFromResult(r, W, H) : null));
  return armDrift(frames, { mirrored: false });
}

/** Current in-memory triage input, exactly as the result page reads it. */
function currentInput(): TriageInput {
  return {
    checks: get(checks),
    beFast: get(beFast),
    caregiverReports: get(caregiverReports),
    baseline: null,
  };
}

/** Pretty-print the current state and the engine's verdict to the console. Returns the result too. */
function evaluate(): TriageResult {
  const input = currentInput();
  const result = triage(input);
  const copy = resultCopy(result, get(locale));
  // eslint-disable-next-line no-console
  console.group(`%cFaceFirst → ${result.state}`, 'font-weight:bold');
  // eslint-disable-next-line no-console
  console.table(
    (['face', 'arm', 'speech'] as CheckId[]).map((id) => {
      const c = input.checks[id];
      return { check: id, status: c.status, score: c.score, side: c.side ?? '' };
    })
  );
  // eslint-disable-next-line no-console
  console.log('BE-FAST:', input.beFast, '| caregiver:', input.caregiverReports);
  // eslint-disable-next-line no-console
  console.log('reasons:', result.reasons);
  // eslint-disable-next-line no-console
  console.log(`headline: "${copy.title}"`);
  // eslint-disable-next-line no-console
  console.groupEnd();
  return result;
}

/** Clear all inputs back to the start-of-flow state. */
function reset(): void {
  for (const id of ['face', 'arm', 'speech'] as CheckId[]) setCheck(unavailableCheck(id));
  beFast.set({});
  caregiverReports.set([]);
  symptomOnset.set(null);
}

export interface FaceFirstDevApi {
  /** Set a single check result directly, e.g. face('ok', 0.2, 'left') or face('poor_quality'). */
  face(status?: CheckResult['status'], score?: number | null, side?: Side | null): FaceFirstDevApi;
  arm(status?: CheckResult['status'], score?: number | null, side?: Side | null): FaceFirstDevApi;
  speech(status?: CheckResult['status'], score?: number | null): FaceFirstDevApi;
  /** Replay a named synthetic clip through the REAL metric and store its real result. */
  faceClip(name: keyof typeof FACE_SCENARIOS): FaceFirstDevApi;
  armClip(name: keyof typeof ARM_SCENARIOS): FaceFirstDevApi;
  /** Answer a BE-FAST question. */
  befast(question: BeFastQuestion, answer: Answer): FaceFirstDevApi;
  /** Toggle a caregiver observation. */
  caregiver(report: CaregiverReport, observed?: boolean): FaceFirstDevApi;
  /** Switch language (en | es | pt). */
  lang(l: 'en' | 'es' | 'pt'): FaceFirstDevApi;
  /** Print the current inputs and the engine's verdict. */
  evaluate(): TriageResult;
  /** Navigate to /result to see the rendered screen. */
  show(): Promise<void>;
  /** Clear everything back to the start. */
  reset(): FaceFirstDevApi;
  /** The named clip libraries, so you can inspect or extend them. */
  scenarios: { face: typeof FACE_SCENARIOS; arm: typeof ARM_SCENARIOS };
}

function buildApi(): FaceFirstDevApi {
  const api: FaceFirstDevApi = {
    face(status = 'ok', score = 0, side = null) {
      setCheck(makeCheck('face', { status, score, side }));
      return api;
    },
    arm(status = 'ok', score = 0, side = null) {
      setCheck(makeCheck('arm', { status, score, side }));
      return api;
    },
    speech(status = 'ok', score = 0) {
      setCheck(makeCheck('speech', { status, score, side: null }));
      return api;
    },
    faceClip(name) {
      setCheck(runFaceScenario(name));
      return api;
    },
    armClip(name) {
      setCheck(runArmScenario(name));
      return api;
    },
    befast(question, answer) {
      setBeFastAnswer(question, answer);
      return api;
    },
    caregiver(report, observed = true) {
      setCaregiverReport(report, observed);
      return api;
    },
    lang(l) {
      locale.set(l);
      return api;
    },
    evaluate,
    async show() {
      await goto('/result');
    },
    reset() {
      reset();
      return api;
    },
    scenarios: { face: FACE_SCENARIOS, arm: ARM_SCENARIOS },
  };
  return api;
}

/** Install `window.facefirst` once. Safe to call repeatedly; no-op outside the browser. */
export function installTestHarness(): void {
  if (typeof window === 'undefined') return;
  const w = window as unknown as { facefirst?: FaceFirstDevApi };
  if (w.facefirst) return;
  w.facefirst = buildApi();
  // eslint-disable-next-line no-console
  console.log(
    '%cFaceFirst dev harness ready.%c Try: facefirst.reset().faceClip("leftDroop").evaluate().show()',
    'font-weight:bold;color:#b00',
    'color:inherit'
  );
}
