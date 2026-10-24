// fast-check generators for triage inputs. Shared by triage.property.test.ts and copy-safety.test.ts.
// See .kiro/specs/triage-engine/design.md (Testing strategy).
import fc from 'fast-check';
import {
  BEFAST_QUESTIONS,
  CAREGIVER_REPORTS,
  CHECK_IDS,
  type Answer,
  type BeFastQuestion,
  type CheckId,
  type CheckResult,
  type TriageInput,
} from '#lib/triage/types.ts';

export const arbScore = fc.double({ min: 0, max: 2, noNaN: true });
export const arbSide = fc.constantFrom('left' as const, 'right' as const, null);
export const arbAnswer = fc.constantFrom<Answer>('yes', 'no', 'unsure');

/** status ∈ {ok, poor_quality, unavailable}; score only when ok. */
export function arbCheckResult(id: CheckId): fc.Arbitrary<CheckResult> {
  return fc.oneof(
    fc.record({ id: fc.constant(id), status: fc.constant('ok' as const), score: arbScore, side: arbSide }),
    fc.record({
      id: fc.constant(id),
      status: fc.constantFrom('poor_quality' as const, 'unavailable' as const),
      score: fc.constant(null),
      side: arbSide,
    })
  );
}

const arbBeFast = fc.record(
  Object.fromEntries(BEFAST_QUESTIONS.map((q) => [q, arbAnswer])) as Record<BeFastQuestion, fc.Arbitrary<Answer>>,
  { requiredKeys: [] }
);

const arbBaseline = fc.option(
  fc.record(Object.fromEntries(CHECK_IDS.map((c) => [c, arbScore])) as Record<CheckId, fc.Arbitrary<number>>, {
    requiredKeys: [],
  }),
  { nil: null }
);

/** All three checks, random BE-FAST subset, random caregiver subset, baseline null or partial. */
export const arbTriageInput: fc.Arbitrary<TriageInput> = fc.record({
  checks: fc.record({ face: arbCheckResult('face'), arm: arbCheckResult('arm'), speech: arbCheckResult('speech') }),
  beFast: arbBeFast,
  caregiverReports: fc.subarray([...CAREGIVER_REPORTS]),
  baseline: arbBaseline,
});
