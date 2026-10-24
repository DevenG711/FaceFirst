// Triage data contracts. Pure types only: no DOM, no Svelte, no MediaPipe.
// See .kiro/specs/triage-engine/design.md (Types). Sides are anatomical, never "screen left".

export type CheckId = 'face' | 'arm' | 'speech';
export type Side = 'left' | 'right'; // anatomical
export type CheckStatus = 'ok' | 'poor_quality' | 'unavailable';

export interface CheckResult {
  id: CheckId;
  status: CheckStatus;
  /** >= 0, null unless status === 'ok'. */
  score: number | null;
  /** Side with weaker movement, if determinable. */
  side: Side | null;
}

export type BeFastQuestion = 'balance' | 'vision' | 'headache' | 'numbness';
export type Answer = 'yes' | 'no' | 'unsure';

export type CaregiverReport = 'face_uneven' | 'arm_weak' | 'speech_wrong';

export interface TriageInput {
  checks: Record<CheckId, CheckResult>;
  beFast: Partial<Record<BeFastQuestion, Answer>>;
  caregiverReports: CaregiverReport[];
  baseline: Partial<Record<CheckId, number>> | null;
}

/** Exactly three outputs. There is no "pass" state and none may be added (safety.md §1). */
export type TriageState = 'CALL_911_NOW' | 'CANNOT_RULE_OUT' | 'RETRY_CAPTURE';

export type Reason =
  | { kind: 'check_flagged'; check: CheckId; side: Side | null; basis: 'population' | 'baseline' }
  | { kind: 'befast_yes'; question: BeFastQuestion }
  | { kind: 'caregiver'; report: CaregiverReport };

export interface BaselineComparison {
  check: CheckId;
  baseline: number;
  current: number;
  deviation: number;
}

export interface TriageResult {
  state: TriageState;
  urgency: 0 | 1 | 2;
  /** Non-empty iff state === 'CALL_911_NOW'. */
  reasons: Reason[];
  /** Non-empty iff state === 'RETRY_CAPTURE'. */
  retryChecks: CheckId[];
  baselineComparisons: BaselineComparison[];
  /** Literal type: the 911 control can never be hidden. */
  show911: true;
  /** No green token exists in the type. */
  colorToken: 'act' | 'caution';
}

export const URGENCY: Record<TriageState, 0 | 1 | 2> = {
  CANNOT_RULE_OUT: 0,
  RETRY_CAPTURE: 1,
  CALL_911_NOW: 2,
};

export const CHECK_IDS: readonly CheckId[] = ['face', 'arm', 'speech'];
export const BEFAST_QUESTIONS: readonly BeFastQuestion[] = ['balance', 'vision', 'headache', 'numbness'];
export const CAREGIVER_REPORTS: readonly CaregiverReport[] = ['face_uneven', 'arm_weak', 'speech_wrong'];
