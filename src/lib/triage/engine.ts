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

/** A usable score: status ok with a real number. Anything else is not scorable. */
function scoreOf(check: CheckResult): number | null {
  return check.status === 'ok' && typeof check.score === 'number' && !Number.isNaN(check.score)
    ? check.score
    : null;
}

/**
 * An `ok` check that claims no usable score is treated as a failed capture, so a malformed
 * result can only escalate (to RETRY_CAPTURE), never fall through to CANNOT_RULE_OUT.
 */
function needsRetry(check: CheckResult): boolean {
  return check.status === 'poor_quality' || (check.status === 'ok' && scoreOf(check) === null);
}

/** Why a check is flagged, or null. Population takes precedence when both apply. */
function flagBasis(check: CheckResult, baseline: Baseline): 'population' | 'baseline' | null {
  const score = scoreOf(check);
  if (score === null) return null;
  if (score > POPULATION_THRESHOLD[check.id]) return 'population';
  // A baseline can only add sensitivity: it never removes a population flag (Req 5.3).
  const base = baseline?.[check.id];
  if (base !== undefined && score - base > BASELINE_DEVIATION_THRESHOLD[check.id]) return 'baseline';
  return null;
}

/** Flags on the population threshold OR the baseline deviation, if a baseline exists for the check. */
export function isFlagged(check: CheckResult, baseline: Baseline): boolean {
  return flagBasis(check, baseline) !== null;
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
    const basis = flagBasis(check, input.baseline);
    if (basis) reasons.push({ kind: 'check_flagged', check: id, side: check.side, basis });
    if (needsRetry(check)) retry.push(id);

    const score = scoreOf(check);
    const base = input.baseline?.[id];
    if (score !== null && base !== undefined) {
      baselineComparisons.push({ check: id, baseline: base, current: score, deviation: score - base });
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
