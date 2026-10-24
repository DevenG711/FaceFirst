# Partner 1: Engine Track

**Tool:** Kiro (Autopilot mode)
**Budget:** ~3 credits for the full track, +1 buffer for fixes
**Spec:** `.kiro/specs/triage-engine/tasks.md` — you own Tasks 1, 2, 3, 4, and the engine half of 7

---

## Step 0 — Manual setup (no AI, ~5 min)

> **Done (superseded).** The full SvelteKit 3 scaffold is on `main`, with `package.json` covering both partners and the Vitest config in `vite.config.ts` (there is no `vitest.config.ts`). See the README's "Stack notes". The original instructions are kept below for reference only.

Before using any Kiro credits, set up the test tooling yourself. This is pure boilerplate.

1. Create `package.json` with `vitest` and `fast-check` as dev dependencies (pin exact versions, not ranges). Run:

```powershell
npm init -y
npm install --save-dev vitest fast-check
```

2. Add the test script to `package.json`:

```json
"scripts": { "test": "vitest --run" }
```

3. Create `vitest.config.ts` at repo root:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
});
```

4. Create the `tests/` directory.

**Checkpoint:** `npx vitest --run` should run with 0 tests found and exit cleanly.

---

## Step 1 — Kiro prompt: Types + Thresholds (Task 2)

Paste into Kiro:

```
Implement Task 2 from the triage-engine spec. Create these two files exactly as specified in the design doc:

1. src/lib/triage/types.ts — all types from the design.md "Types" section: CheckId, Side, CheckStatus, CheckResult, BeFastQuestion, Answer, CaregiverReport, TriageInput, TriageState, Reason, BaselineComparison, TriageResult, and the URGENCY const. Make show911 a literal `true` type and colorToken a union of 'act' | 'caution' (no green) so the compiler enforces the safety rules.

2. src/lib/triage/thresholds.ts — POPULATION_THRESHOLD and BASELINE_DEVIATION_THRESHOLD records per CheckId. Each must carry a comment marking it as an uncalibrated research placeholder per safety.md section 5.

After creating both files, run `npx tsc --noEmit` to confirm they compile.
```

**Unblocks:** Partner 2's `copy.ts` (they need the TriageResult type). Tell them when this is done.

---

## Step 2 — Kiro prompt: Engine (Task 3)

Paste into Kiro:

```
Implement Task 3 from the triage-engine spec. Create src/lib/triage/engine.ts with:

- isFlagged(check, baseline): returns false if status !== 'ok'. Flags on population threshold OR baseline deviation (if a baseline exists for that check). Adding a baseline can only add flags, never remove them.
- triage(input): collects reasons (flagged checks with side + basis, BE-FAST 'yes' answers, caregiver reports), then selects state: any reason → CALL_911_NOW; else any poor_quality → RETRY_CAPTURE with retryChecks populated; else CANNOT_RULE_OUT. Populate urgency, reasons, retryChecks, baselineComparisons, show911: true, and colorToken ('act' for CALL_911_NOW, 'caution' for the other two).

Import all thresholds from thresholds.ts. Verify Task 3.3: no numeric threshold literals appear anywhere in engine.ts — all numbers must come from thresholds.ts.

After creating the file, run `npx tsc --noEmit` to confirm it compiles.
```

---

## Step 3 — Kiro prompt: Arbitraries + Property tests (Task 4)

Paste into Kiro:

```
Implement Task 4 from the triage-engine spec.

1. Create tests/arbitraries.ts with fast-check arbitraries:
   - arbCheckResult(id): status in {ok, poor_quality, unavailable}; score fc.double({min:0, max:2, noNaN:true}) when ok else null; side in {left, right, null}.
   - arbTriageInput: all three checks, random BE-FAST subset, random caregiver subset, baseline null or random partial record.

2. Create tests/triage.property.test.ts covering properties P1–P9 from design.md, each with at least 1000 runs:
   - P1: output state in the three allowed states; show911 === true; colorToken in {act, caution} and matches state
   - P2: never throws; same input → deep-equal output
   - P3: any flagged check / BE-FAST yes / caregiver report → CALL_911_NOW, reasons contain it
   - P4: monotonicity — add one finding → urgency non-decreasing
   - P5: monotonicity — increase one ok score → urgency non-decreasing
   - P6: degrade one check ok → poor_quality → urgency non-decreasing
   - P7: no findings + any poor_quality → RETRY_CAPTURE with correct retryChecks
   - P8: adding a baseline → urgency non-decreasing
   - P9: no findings, no poor_quality → CANNOT_RULE_OUT

Run `npx vitest --run` after writing. All tests must pass. Fix any failures before finishing.
```

---

## Step 4 — Checkpoint (manual)

Run the full suite and log the result:

```powershell
npx vitest --run
```

If all green, append an entry to `docs/KIRO_LOG.md` with the test count and pass/fail status.

If there are failures you can't fix manually, use one more Kiro prompt:

```
Run `npx vitest --run` and fix all failing tests in the triage engine. Do not weaken, skip, or delete any safety test to make the build pass — fix the code instead.
```

---

## After you're done

Your `tests/arbitraries.ts` is the merge point for Partner 2's copy-safety test C1. Let them know when it's committed so they can run their full suite.
