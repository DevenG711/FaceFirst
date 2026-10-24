// Triage engine: the safety-critical core. Pure and synchronous: no DOM, no I/O, no clock, no randomness.
// Returns exactly one of CALL_911_NOW, CANNOT_RULE_OUT, RETRY_CAPTURE. There is no "pass" state.
// See .kiro/specs/triage-engine/design.md (Algorithm). Every number comes from thresholds.ts.
import { BASELINE_DEVIATION_THRESHOLD, POPULATION_THRESHOLD } from './thresholds.ts';
import {
  BEFAST_QUESTIONS,
  CHECK_IDS,
  URGENCY,
  type BaselineComparison,
  type CheckId,
  type CheckResult,
  type Reason,
  type TriageInput,
  type TriageResult,
  type TriageState,
} from './types.ts';

type Baseline = TriageInput['baseline'];
type BaselineSigned = TriageInput['baselineSigned'];

/** A usable score: status ok with a real number. Anything else is not scorable. */
function scoreOf(check: CheckResult): number | null {
  return check.status === 'ok' && typeof check.score === 'number' && !Number.isNaN(check.score)
    ? check.score
    : null;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Signed change from the person's own baseline (positive = left side got relatively weaker), or null. */
function signedDelta(check: CheckResult, baselineSigned: BaselineSigned): number | null {
  if (scoreOf(check) === null) return null;
  const now = check.signed;
  const base = baselineSigned?.[check.id];
  return isNum(now) && isNum(base) ? now - base : null;
}

/**
 * Deviation from the person's baseline, or null if there is nothing to compare. Two views, and the
 * LARGER wins so a baseline can only add sensitivity:
 * - unsigned: score − baseline score (the asymmetry grew);
 * - signed:   |signed − baseline signed| (the asymmetry grew OR moved to the other side).
 */
function deviationOf(check: CheckResult, baseline: Baseline, baselineSigned: BaselineSigned): number | null {
  const score = scoreOf(check);
  if (score === null) return null;
  const base = baseline?.[check.id];
  const unsigned = isNum(base) ? score - base : null;
  const delta = signedDelta(check, baselineSigned);
  const signed = delta === null ? null : Math.abs(delta);
  if (unsigned === null) return signed;
  if (signed === null) return unsigned;
  return Math.max(unsigned, signed);
}

/**
 * An `ok` check that claims no usable score is treated as a failed capture, so a malformed
 * result can only escalate (to RETRY_CAPTURE), never fall through to CANNOT_RULE_OUT.
 */
function needsRetry(check: CheckResult): boolean {
  return check.status === 'poor_quality' || (check.status === 'ok' && scoreOf(check) === null);
}

/** Why a check is flagged, or null. Population takes precedence when both apply. */
function flagBasis(
  check: CheckResult,
  baseline: Baseline,
  baselineSigned: BaselineSigned = null
): 'population' | 'baseline' | null {
  const score = scoreOf(check);
  if (score === null) return null;
  if (score > POPULATION_THRESHOLD[check.id]) return 'population';
  // A baseline can only add sensitivity: it never removes a population flag (Req 5.3).
  const deviation = deviationOf(check, baseline, baselineSigned);
  if (deviation !== null && deviation > BASELINE_DEVIATION_THRESHOLD[check.id]) return 'baseline';
  return null;
}

/** Flags on the population threshold OR the baseline deviation, if a baseline exists for the check. */
export function isFlagged(check: CheckResult, baseline: Baseline, baselineSigned: BaselineSigned = null): boolean {
  return flagBasis(check, baseline, baselineSigned) !== null;
}

/**
 * Side to report for a flag. For a baseline flag driven by the signed change, it is the side that got
 * weaker RELATIVE TO THEIR USUAL FACE/ARMS (which can differ from the currently lower side, e.g. a
 * person whose left is usually lower whose right side now drops to meet it). Otherwise the check's side.
 */
function flagSide(check: CheckResult, basis: 'population' | 'baseline', baselineSigned: BaselineSigned) {
  if (basis !== 'baseline') return check.side;
  const delta = signedDelta(check, baselineSigned);
  if (delta === null || Math.abs(delta) <= BASELINE_DEVIATION_THRESHOLD[check.id]) return check.side;
  return delta > 0 ? 'left' : 'right';
}

const COLOR: Record<TriageState, TriageResult['colorToken']> = {
  CALL_911_NOW: 'act',
  CANNOT_RULE_OUT: 'caution',
  RETRY_CAPTURE: 'caution',
};

export function triage(input: TriageInput): TriageResult {
  const reasons: Reason[] = [];
  const retry: CheckId[] = [];
  const baselineComparisons: BaselineComparison[] = [];

  for (const id of CHECK_IDS) {
    const check = input.checks[id];
    const signedBase = input.baselineSigned ?? null;
    const basis = flagBasis(check, input.baseline, signedBase);
    if (basis) reasons.push({ kind: 'check_flagged', check: id, side: flagSide(check, basis, signedBase), basis });
    if (needsRetry(check)) retry.push(id);

    const score = scoreOf(check);
    const base = input.baseline?.[id];
    const deviation = deviationOf(check, input.baseline, signedBase);
    if (score !== null && isNum(base) && deviation !== null) {
      const comparison: BaselineComparison = { check: id, baseline: base, current: score, deviation };
      if (signedDelta(check, signedBase) !== null) {
        comparison.signedBaseline = signedBase![id]!;
        comparison.signedCurrent = check.signed!;
      }
      baselineComparisons.push(comparison);
    }
  }

  for (const question of BEFAST_QUESTIONS) {
    if (input.beFast[question] === 'yes') reasons.push({ kind: 'befast_yes', question });
  }

  for (const report of new Set(input.caregiverReports)) {
    reasons.push({ kind: 'caregiver', report });
  }

  const state: TriageState =
    reasons.length > 0 ? 'CALL_911_NOW' : retry.length > 0 ? 'RETRY_CAPTURE' : 'CANNOT_RULE_OUT';

  return {
    state,
    urgency: URGENCY[state],
    reasons,
    retryChecks: state === 'RETRY_CAPTURE' ? retry : [],
    baselineComparisons,
    show911: true,
    colorToken: COLOR[state],
  };
}
