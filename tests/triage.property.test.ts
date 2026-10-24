// Safety properties of the triage engine (P1–P9). See .kiro/specs/triage-engine/design.md (Testing strategy).
// These guard .kiro/steering/safety.md. Do not weaken, skip, or delete them; fix the engine instead.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { triage } from '#lib/triage/engine.ts';
import { BASELINE_DEVIATION_THRESHOLD, POPULATION_THRESHOLD } from '#lib/triage/thresholds.ts';
import {
  BEFAST_QUESTIONS,
  CAREGIVER_REPORTS,
  CHECK_IDS,
  URGENCY,
  type CheckId,
  type CheckResult,
  type TriageInput,
} from '#lib/triage/types.ts';
import { arbCheckResult, arbScore, arbTriageInput } from './arbitraries.ts';

const RUNS = { numRuns: 1000 };
const STATES = ['CALL_911_NOW', 'CANNOT_RULE_OUT', 'RETRY_CAPTURE'] as const;
const arbCheckId = fc.constantFrom(...CHECK_IDS);

// Independent oracle for "flagged", written from the requirements rather than the engine.
function expectFlagged(c: CheckResult, baseline: TriageInput['baseline']): boolean {
  if (c.status !== 'ok' || c.score === null) return false;
  const base = baseline?.[c.id];
  return (
    c.score > POPULATION_THRESHOLD[c.id] ||
    (base !== undefined && c.score - base > BASELINE_DEVIATION_THRESHOLD[c.id])
  );
}

/** Removes every finding: no BE-FAST yes, no caregiver reports, every ok score at or below its thresholds. */
function withoutFindings(input: TriageInput): TriageInput {
  const checks = { ...input.checks };
  for (const id of CHECK_IDS) {
    const c = checks[id];
    if (c.status === 'ok' && c.score !== null) {
      const base = input.baseline?.[id];
      // Capping at the baseline itself keeps the deviation <= 0, avoiding float rounding at the edge.
      const cap = Math.min(POPULATION_THRESHOLD[id], base ?? Infinity);
      checks[id] = { ...c, score: Math.min(c.score, cap) };
    }
  }
  const beFast = Object.fromEntries(
    Object.entries(input.beFast).map(([q, a]) => [q, a === 'yes' ? 'no' : a])
  ) as TriageInput['beFast'];
  return { ...input, checks, beFast, caregiverReports: [] };
}

const arbNoFindings = arbTriageInput.map(withoutFindings);

/** One way to add a single finding to an input. */
const arbAddFinding: fc.Arbitrary<(i: TriageInput) => TriageInput> = fc.oneof(
  fc.constantFrom(...BEFAST_QUESTIONS).map((q) => (i: TriageInput) => ({ ...i, beFast: { ...i.beFast, [q]: 'yes' } })),
  fc.constantFrom(...CAREGIVER_REPORTS).map((r) => (i: TriageInput) => ({
    ...i,
    caregiverReports: [...i.caregiverReports, r],
  })),
  fc.tuple(arbCheckId, fc.double({ min: 0.01, max: 2, noNaN: true }) /* big enough to survive float addition */).map(
    ([id, extra]) =>
      (i: TriageInput) => ({
        ...i,
        checks: {
          ...i.checks,
          [id]: { ...i.checks[id], status: 'ok', score: POPULATION_THRESHOLD[id] + extra },
        },
      })
  )
);

describe('triage engine properties', () => {
  it('P1: closed output set, show911 always true, color matches state (no green)', () => {
    fc.assert(
      fc.property(arbTriageInput, (input) => {
        const r = triage(input);
        expect(STATES).toContain(r.state);
        expect(r.show911).toBe(true);
        expect(r.colorToken).toBe(r.state === 'CALL_911_NOW' ? 'act' : 'caution');
        expect(r.urgency).toBe(URGENCY[r.state]);
      }),
      RUNS
    );
  });

  it('P2: total and deterministic', () => {
    fc.assert(
      fc.property(arbTriageInput, (input) => {
        const before = structuredClone(input);
        const a = triage(input);
        const b = triage(structuredClone(input));
        expect(a).toEqual(b);
        expect(input).toEqual(before); // does not mutate its input
      }),
      RUNS
    );
  });

  it('P3: any finding gives CALL_911_NOW and every finding is listed as a reason', () => {
    fc.assert(
      fc.property(arbTriageInput, (input) => {
        const r = triage(input);
        const flagged = CHECK_IDS.filter((id) => expectFlagged(input.checks[id], input.baseline));
        const yes = BEFAST_QUESTIONS.filter((q) => input.beFast[q] === 'yes');
        const reports = [...new Set(input.caregiverReports)];
        const hasFinding = flagged.length + yes.length + reports.length > 0;

        expect(r.state === 'CALL_911_NOW').toBe(hasFinding);
        expect(r.reasons.length > 0).toBe(hasFinding);
        for (const id of flagged) {
          expect(r.reasons).toContainEqual(
            expect.objectContaining({ kind: 'check_flagged', check: id, side: input.checks[id].side })
          );
        }
        for (const question of yes) expect(r.reasons).toContainEqual({ kind: 'befast_yes', question });
        for (const report of reports) expect(r.reasons).toContainEqual({ kind: 'caregiver', report });
        expect(r.reasons).toHaveLength(flagged.length + yes.length + reports.length);
      }),
      RUNS
    );
  });

  it('P4: adding one finding never lowers urgency', () => {
    fc.assert(
      fc.property(arbTriageInput, arbAddFinding, (input, add) => {
        const after = triage(add(input));
        expect(after.urgency).toBeGreaterThanOrEqual(triage(input).urgency);
        expect(after.state).toBe('CALL_911_NOW');
      }),
      RUNS
    );
  });

  it('P5: raising one ok score never lowers urgency', () => {
    fc.assert(
      fc.property(arbTriageInput, arbCheckId, arbScore, (input, id, delta) => {
        const c = input.checks[id];
        fc.pre(c.status === 'ok' && c.score !== null);
        const raised = { ...input, checks: { ...input.checks, [id]: { ...c, score: c.score! + delta } } };
        expect(triage(raised).urgency).toBeGreaterThanOrEqual(triage(input).urgency);
      }),
      RUNS
    );
  });

  // Restricted to checks that were not flagged: a flagged score that is then lost to a bad capture
  // is unknowable to the engine, and Req 4.1 requires RETRY_CAPTURE there. What must hold is that a
  // bad capture never ranks below a good capture that found nothing (Req 4.3).
  it('P6: degrading one non-flagged check from ok to poor_quality never lowers urgency', () => {
    fc.assert(
      fc.property(arbTriageInput, arbCheckId, (input, id) => {
        fc.pre(input.checks[id].status === 'ok' && !expectFlagged(input.checks[id], input.baseline));
        const degraded = {
          ...input,
          checks: { ...input.checks, [id]: { ...input.checks[id], status: 'poor_quality' as const, score: null } },
        };
        expect(triage(degraded).urgency).toBeGreaterThanOrEqual(triage(input).urgency);
      }),
      RUNS
    );
  });

  it('P7: no findings + any poor_quality gives RETRY_CAPTURE listing exactly those checks', () => {
    fc.assert(
      fc.property(arbNoFindings, arbCheckId, (base, forced) => {
        const input = {
          ...base,
          checks: { ...base.checks, [forced]: { ...base.checks[forced], status: 'poor_quality' as const, score: null } },
        };
        const r = triage(input);
        expect(r.state).toBe('RETRY_CAPTURE');
        expect(r.reasons).toEqual([]);
        expect(r.retryChecks).toEqual(CHECK_IDS.filter((id) => input.checks[id].status === 'poor_quality'));
      }),
      RUNS
    );
  });

  it('P8: adding a baseline (any values) never lowers urgency', () => {
    const arbBaseline = fc.record(
      Object.fromEntries(CHECK_IDS.map((c) => [c, arbScore])) as Record<CheckId, fc.Arbitrary<number>>,
      { requiredKeys: [] }
    );
    fc.assert(
      fc.property(arbTriageInput, arbBaseline, (input, baseline) => {
        const without = { ...input, baseline: null };
        const withBaseline = { ...input, baseline };
        expect(triage(withBaseline).urgency).toBeGreaterThanOrEqual(triage(without).urgency);
      }),
      RUNS
    );
  });

  it('P9: no findings and no poor_quality gives CANNOT_RULE_OUT', () => {
    fc.assert(
      fc.property(arbNoFindings, (base) => {
        const checks = Object.fromEntries(
          CHECK_IDS.map((id) => {
            const c = base.checks[id];
            return [id, c.status === 'poor_quality' ? { ...c, status: 'unavailable' as const } : c];
          })
        ) as TriageInput['checks'];
        const r = triage({ ...base, checks });
        expect(r.state).toBe('CANNOT_RULE_OUT');
        expect(r.reasons).toEqual([]);
        expect(r.retryChecks).toEqual([]);
      }),
      RUNS
    );
  });
});

describe('triage engine examples', () => {
  const ok = (id: CheckId, score: number): CheckResult => ({ id, status: 'ok', score, side: 'left' });
  const unavailable = (id: CheckId): CheckResult => ({ id, status: 'unavailable', score: null, side: null });

  it('baseline deviation flags a check below the population threshold and reports the comparison (Req 5.1, 5.4)', () => {
    const current = POPULATION_THRESHOLD.face; // at the threshold, so not a population flag
    const baseline = current - BASELINE_DEVIATION_THRESHOLD.face * 2;
    const r = triage({
      checks: { face: ok('face', current), arm: unavailable('arm'), speech: unavailable('speech') },
      beFast: {},
      caregiverReports: [],
      baseline: { face: baseline },
    });
    expect(r.state).toBe('CALL_911_NOW');
    expect(r.reasons).toEqual([{ kind: 'check_flagged', check: 'face', side: 'left', basis: 'baseline' }]);
    expect(r.baselineComparisons).toEqual([
      { check: 'face', baseline, current, deviation: current - baseline },
    ]);
  });

  it('an ok check with no usable score asks for a retry instead of passing silently', () => {
    const r = triage({
      checks: {
        face: { id: 'face', status: 'ok', score: null, side: null },
        arm: unavailable('arm'),
        speech: unavailable('speech'),
      },
      beFast: {},
      caregiverReports: [],
      baseline: null,
    });
    expect(r.state).toBe('RETRY_CAPTURE');
    expect(r.retryChecks).toEqual(['face']);
  });

  it('engine.ts has no numeric literals other than 0 and 1 (Req 6.3)', () => {
    const src = readFileSync(new URL('../src/lib/triage/engine.ts', import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '') // block comments
      .replace(/\/\/.*$/gm, '') // line comments
      .replace(/(['"`])(?:\\.|(?!\1).)*\1/g, ''); // string literals
    const literals = src.match(/(?<![\w$.])(?:\d[\d_]*\.?\d*|\.\d+)(?:e[+-]?\d+)?(?![\w$])/gi) ?? [];
    expect(literals.filter((n) => n !== '0' && n !== '1')).toEqual([]);
  });
});

// Keep arbCheckResult exercised directly so a broken generator fails loudly.
it('arbCheckResult only scores ok checks', () => {
  fc.assert(
    fc.property(arbCheckId.chain(arbCheckResult), (c) => {
      expect(c.score === null).toBe(c.status !== 'ok');
    }),
    RUNS
  );
});
