# Design: Triage Engine

## Overview

A pure, synchronous function `triage(input: TriageInput): TriageResult` in `src/lib/triage/engine.ts`. No DOM, no I/O, no randomness, no clock reads. Metrics modules compute raw scores; the engine alone decides what is flagged and which state to return. Copy is resolved by `copy.ts` from state → i18n keys so the copy-safety test can enumerate every reachable string.

```mermaid
flowchart LR
  F[face metrics] --> I[TriageInput]
  A[arm metrics] --> I
  S[speech metrics] --> I
  Q[BE-FAST answers] --> I
  C[caregiver reports] --> I
  B[baseline scores] --> I
  I --> E[triage()] --> R[TriageResult] --> K[resultCopy()] --> UI[result screen / EMS card]
```

## Types (`src/lib/triage/types.ts`)

```ts
export type CheckId = 'face' | 'arm' | 'speech';
export type Side = 'left' | 'right';              // anatomical
export type CheckStatus = 'ok' | 'poor_quality' | 'unavailable';

export interface CheckResult {
  id: CheckId;
  status: CheckStatus;
  score: number | null;      // >= 0, null unless status === 'ok'
  side: Side | null;         // side with weaker movement, if determinable
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

export type TriageState = 'CALL_911_NOW' | 'CANNOT_RULE_OUT' | 'RETRY_CAPTURE';

export type Reason =
  | { kind: 'check_flagged'; check: CheckId; side: Side | null; basis: 'population' | 'baseline' }
  | { kind: 'befast_yes'; question: BeFastQuestion }
  | { kind: 'caregiver'; report: CaregiverReport };

export interface BaselineComparison { check: CheckId; baseline: number; current: number; deviation: number }

export interface TriageResult {
  state: TriageState;
  urgency: 0 | 1 | 2;
  reasons: Reason[];                 // non-empty iff state === 'CALL_911_NOW'
  retryChecks: CheckId[];            // non-empty iff state === 'RETRY_CAPTURE'
  baselineComparisons: BaselineComparison[];
  show911: true;                     // literal type: cannot be false
  colorToken: 'act' | 'caution';     // no green token exists in the type
}

export const URGENCY: Record<TriageState, 0 | 1 | 2> = {
  CANNOT_RULE_OUT: 0, RETRY_CAPTURE: 1, CALL_911_NOW: 2,
};
```

Making `show911: true` a literal type and `colorToken` a union without green lets the compiler enforce part of the safety rules before tests run.

"unsure" BE-FAST answers are not treated as "yes" (to avoid forcing CALL_911 on every hesitant tap) but are listed on the EMS card. Revisit if the team prefers maximal escalation.

## Thresholds (`src/lib/triage/thresholds.ts`)

```ts
/** UNCALIBRATED RESEARCH PLACEHOLDERS. Not clinically validated. Do not use for diagnosis. */
export const POPULATION_THRESHOLD: Record<CheckId, number> = {
  face: 0.12,   // normalized asymmetry (inter-ocular units) — placeholder
  arm: 0.15,    // normalized wrist drift difference (shoulder-width units) — placeholder
  speech: 0.30, // 1 − word accuracy — placeholder
};
export const BASELINE_DEVIATION_THRESHOLD: Record<CheckId, number> = {
  face: 0.05, arm: 0.08, speech: 0.20, // placeholders
};
```

## Algorithm

```
isFlagged(check, baseline):
  if check.status !== 'ok' → false
  popFlag = check.score > POPULATION_THRESHOLD[id]
  if baseline[id] defined:
    devFlag = (check.score − baseline[id]) > BASELINE_DEVIATION_THRESHOLD[id]
    return popFlag || devFlag        // baseline only adds sensitivity
  return popFlag

triage(input):
  reasons = flagged checks ∪ BE-FAST 'yes' ∪ caregiver reports
  if reasons non-empty         → CALL_911_NOW
  else if any status poor_quality → RETRY_CAPTURE (retryChecks = those checks)
  else                         → CANNOT_RULE_OUT
```

Design decision: with a baseline, a check is flagged if it exceeds either the baseline deviation or the population threshold. This guarantees "adding a baseline never lowers urgency" (Req 5.3) at the cost of not suppressing false alarms for people with natural asymmetry. False alarms are acceptable in an escalate-only design.

## Copy (`src/lib/triage/copy.ts`)

`resultCopy(result, locale) → { titleKey, bodyKeys[], actionKeys[] }`, resolved against `lib/i18n/{en,es,pt}.json` under `result.*`.

| State | Title (en) | Body (en) | Color |
|---|---|---|---|
| `CALL_911_NOW` | "CALL 911 NOW" | "Warning signs of stroke were found: {reasons}. Note the time symptoms started." | act (red) |
| `CANNOT_RULE_OUT` | "We can't rule out a stroke" | "This check cannot rule out a stroke. If you noticed sudden symptoms, call 911." + action: "You can run this check again at any time. Don't wait if you have symptoms. Call 911." (never a timed re-check: safety.md §2) | caution (amber) |
| `RETRY_CAPTURE` | "We couldn't get a clear reading" | "Please retry: {checks}. If you noticed sudden symptoms, call 911." | caution (amber) |

## Testing strategy

Arbitraries (`fc`) in `tests/arbitraries.ts`:
- `arbCheckResult(id)`: status ∈ {ok, poor_quality, unavailable}; score `fc.double({min:0,max:2,noNaN:true})` when ok, else null; side ∈ {left,right,null}.
- `arbTriageInput`: all three checks, random BE-FAST subset, random caregiver subset, baseline null or random partial record.

Properties (`tests/triage.property.test.ts`), each ≥ 1000 runs:

| # | Property | Req |
|---|---|---|
| P1 | Output state ∈ the three allowed states; `show911 === true`; colorToken ∈ {act, caution} and matches state | 1.1, 7.5, 7.6 |
| P2 | Never throws; same input → deep-equal output | 1.3, 1.4 |
| P3 | Any flagged check / BE-FAST yes / caregiver report ⇒ `CALL_911_NOW`, and reasons contain it | 2.1–2.4 |
| P4 | Monotonicity: add one finding ⇒ urgency non-decreasing | 3.1 |
| P5 | Monotonicity: increase one ok score ⇒ urgency non-decreasing | 3.2 |
| P6 | Degrade one check ok → poor_quality ⇒ urgency non-decreasing | 4.3 |
| P7 | No findings + any poor_quality ⇒ `RETRY_CAPTURE` with correct retryChecks | 4.1, 4.4 |
| P8 | Adding a baseline (any values) ⇒ urgency non-decreasing | 5.3 |
| P9 | No findings, no poor_quality ⇒ `CANNOT_RULE_OUT` | 2.5 |

Copy safety (`tests/copy-safety.test.ts`):
- C1 [PBT]: for random `TriageInput` × locale, resolved copy contains no banned word (`findBannedWords()` with no locale, i.e. every locale's list — the same Unicode whole-word matcher as `safety-lint.mjs`; JS `\b` is ASCII-only and must not be used).
- C2 [PBT]: `CANNOT_RULE_OUT` and `RETRY_CAPTURE` copy contains the localized "call 911" line.
- C3 (example): every key under `result.*` and `card.*` in all three JSON files passes the banned-word scan; all keys in `en.json` exist in `es.json` and `pt.json`.
- C4 (example): a deliberately bad string ("You're fine") is caught, proving the scanner works.

Banned-word lists live in `src/lib/triage/bannedWords.json` (already created). `bannedWords.ts` imports it and exports `findBannedWords()`; the zero-dependency `scripts/safety-lint.mjs` (used by the safety-lint hook and CI) reads the same JSON, so there is one source of truth. Matching is Unicode-aware whole-word with curly apostrophes normalized to `'`.
