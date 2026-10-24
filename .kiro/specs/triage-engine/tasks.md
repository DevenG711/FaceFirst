# Implementation Plan: Triage Engine

- [ ] 1. Set up test tooling
  - Add exact-pinned `vitest` and `fast-check` dev dependencies; add `"test": "vitest --run"` script.
  - Configure Vitest to include `tests/**/*.test.ts`.
  - _Requirements: 1.1_

- [ ] 2. Define types and thresholds
  - [ ] 2.1 Create `src/lib/triage/types.ts` with `TriageInput`, `TriageResult`, `URGENCY`, literal `show911: true`, and `colorToken: 'act' | 'caution'`.
    - _Requirements: 1.1, 7.5, 7.6_
  - [ ] 2.2 Create `src/lib/triage/thresholds.ts` with `POPULATION_THRESHOLD` and `BASELINE_DEVIATION_THRESHOLD`, each documented as an uncalibrated research placeholder.
    - _Requirements: 6.1, 6.2_

- [ ] 3. Implement the engine
  - [ ] 3.1 Implement `isFlagged()` (population OR baseline deviation) in `src/lib/triage/engine.ts`.
    - _Requirements: 5.1, 5.2, 5.3_
  - [ ] 3.2 Implement `triage()`: collect reasons, then CALL_911_NOW → RETRY_CAPTURE → CANNOT_RULE_OUT; populate `retryChecks`, `baselineComparisons`, `colorToken`.
    - _Requirements: 1.1–1.4, 2.1–2.5, 4.1, 4.2, 4.4, 5.4_
  - [ ] 3.3 Confirm no numeric threshold literals in `engine.ts`.
    - _Requirements: 6.3_

- [ ] 4. Property-based tests for the engine
  - [ ] 4.1 Write arbitraries in `tests/arbitraries.ts` (`arbCheckResult`, `arbTriageInput`).
  - [ ] 4.2 P1–P2: closed output set, show911, color mapping, totality, determinism.
    - _Requirements: 1.1–1.4, 7.5, 7.6_
  - [ ] 4.3 P3, P9: escalation on any finding; CANNOT_RULE_OUT only when nothing found and nothing poor-quality.
    - _Requirements: 2.1–2.5_
  - [ ] 4.4 P4–P5: monotonicity on findings and on scores.
    - _Requirements: 3.1, 3.2_
  - [ ] 4.5 P6–P7: poor quality never less urgent; RETRY_CAPTURE lists the right checks.
    - _Requirements: 4.1, 4.3, 4.4_
  - [ ] 4.6 P8: adding a baseline never lowers urgency.
    - _Requirements: 5.3_

- [ ] 5. Result copy
  - [ ] 5.1 Create `src/lib/triage/bannedWords.ts` with per-locale banned lists from `safety.md` and a `findBannedWords(text, locale)` whole-word matcher.
    - _Requirements: 7.1_
  - [ ] 5.2 Add `result.*` keys to `src/lib/i18n/en.json`, `es.json`, `pt.json` (three states, reasons, retry, re-check in 5 minutes).
    - _Requirements: 7.2, 7.3, 7.4_
  - [ ] 5.3 Implement `resultCopy(result, locale)` in `src/lib/triage/copy.ts`.
    - _Requirements: 7.1–7.4_

- [ ] 6. Copy-safety tests (`tests/copy-safety.test.ts`)
  - [ ] 6.1 C1 [PBT]: random input × locale → resolved copy has no banned words.
  - [ ] 6.2 C2 [PBT]: CANNOT_RULE_OUT and RETRY_CAPTURE copy contains the localized call-911 line.
  - [ ] 6.3 C3: all `result.*` / `card.*` keys pass the scan; es/pt have every en key.
  - [ ] 6.4 C4: scanner catches a planted "You're fine" and ignores "abnormal".
  - _Requirements: 7.1, 7.2, 7.4_

- [ ] 7. Checkpoint
  - Run `npx vitest --run`; all engine and copy-safety tests pass. Log the result in `docs/KIRO_LOG.md`.
