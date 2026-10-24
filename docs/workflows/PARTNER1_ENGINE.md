# Partner 1: Engine Track

## Task breakdown

### Task 1: Shared project scaffold, pushed to main

- Run `git status` and `git pull --rebase origin main` first. Never force-push.
- Look up current versions with `npm view <pkg> version` and pin them exactly (no `^` or `~`):
  - `@sveltejs/kit`, `svelte`, `vite`, `@sveltejs/vite-plugin-svelte`, `@sveltejs/adapter-static`, `typescript`, `svelte-check`, `tslib`
  - `vitest`, `fast-check`
  - `@mediapipe/tasks-vision`, `idb-keyval`
- Scripts:
  - `dev`, `build`, `preview`
  - `check` (`svelte-check`)
  - `test` (`vitest --run`)
  - `lint:safety` (`node scripts/safety-lint.mjs`)
- Config files:
  - `svelte.config.js` with adapter-static and the fallback set
  - `vite.config.ts` with a `test` block: include `tests/**/*.test.ts`, environment `node`
  - `tsconfig.json` with `strict` and `resolveJsonModule`
  - `src/app.html`, and `src/app.css` with the design tokens
- App files:
  - `src/routes/+layout.ts` (`prerender = true`)
  - a minimal `+layout.svelte` that renders `Call911Button` first, then the slot
  - `Call911Button.svelte` (`<a href="tel:911">`, label taken from i18n)
  - a placeholder `+page.svelte` that shows `home.disclaimer`
  - Mark the placeholders in comments as partner2-owned and free to replace.
- Create `src/lib/i18n/{en,es,pt}.json` with `nav.call911` and `home.disclaimer`. The disclaimer is the exact text from `safety.md`, translated.
- Add a smoke test (`tests/scaffold.test.ts`) that imports a JSON file. It proves Vitest and aliases work.
- Verify: `npm install`, `npm run check`, `npm run build`, `npx vitest --run`, then the safety lint.
- Commit `package.json` and `package-lock.json` together, then push.

**Demo:** partner2 pulls and `npm run dev` serves a page with the 911 button and the disclaimer. CI goes green.

### Task 2: Triage types and thresholds

- Write `types.ts` exactly as in the design, including the `URGENCY` constant.
- Write `thresholds.ts` with `POPULATION_THRESHOLD` and `BASELINE_DEVIATION_THRESHOLD`. Add a `QUALITY` block for the metrics constants (`MIN_FACE_FRAMES`, `MIN_ARM_FRAMES`, `MIN_SPEECH_MS`, `SILENCE_LEVEL`, `MIN_PAUSE_MS`).
- Head the file with an UNCALIBRATED banner and give each constant a placeholder comment.
- Write `tests/arbitraries.ts` (`arbCheckResult`, `arbTriageInput`).

**Demo:** `npm run check` passes and the safety lint passes the thresholds rule.

### Task 3: Engine plus P1–P9

- Implement `isFlagged()` (population threshold OR baseline deviation) and `triage()` per the design. Build `baselineComparisons` and set `colorToken` from the state.
- Write `tests/triage.property.test.ts` with P1–P9, each with `numRuns: 1000`.
- Add an example-based test that reads `engine.ts` and asserts it has no numeric literals other than 0 and 1 (Req 6.3).

**Demo:** `npx vitest --run` shows all nine properties passing.

Commit and push.

### Task 4: Banned-word matcher, result copy and copy-safety tests

- `bannedWords.ts` exports `findBannedWords(text, locale)`. It uses the same Unicode lookaround regex and curly-apostrophe normalization as the lint.
- Add `result.*` keys in all three locales:
  - title and body for each state
  - a label for each reason: each check (side as a placeholder), BE-FAST, caregiver
  - `result.recheck5min`, `result.call911Line`, check names
- `copy.ts` exports `resultCopy(result, locale)`, which returns `{ titleKey, bodyKeys, actionKeys, params }`. Add a `t(locale, key, params)` resolver so tests can render the strings.
- Write `tests/copy-safety.test.ts` with C1–C4.

**Demo:** the tests pass. Planting "You're fine" in `result.*` breaks both C3 and the lint, then revert it.

Commit and push.

### Task 5: `geometry.ts` plus geometry properties

- Implement the pure functions listed under "How the metrics work". Reuse caller-supplied output buffers where it matters for hot loops.
- Properties in `tests/metrics.property.test.ts`:
  - derotating by the roll angle makes the eye line horizontal
  - scaling is invariant: uniformly scaling all points leaves normalized values unchanged
  - `toAnatomical` applied twice with flipped `mirrored` returns the original side

**Demo:** the tests pass.

### Task 6: `faceAsymmetry.ts`

- Implement `faceAsymmetry(frames, { mirrored }) → CheckResult`. Each frame holds the 4 landmarks plus the 8 blendshapes.
- Properties:
  - score ≥ 0, and `null` unless status is `ok`
  - invariant to translation, scale and roll
  - a perfectly symmetric face scores near 0
  - lowering one mouth corner never lowers the score (monotonic)
  - drooping the anatomical left corner gives `side: 'left'` in both mirrored modes
  - too few frames gives `poor_quality`
- Pipe the result into `triage()` in one integration test: a large droop gives `CALL_911_NOW` with the correct side.

Commit and push.

### Task 7: `armDrift.ts`

- Implement `armDrift(frames, { mirrored }) → CheckResult`.
- Properties:
  - invariant to scale and translation
  - equal drift on both arms scores near 0
  - more drift on one arm never lowers the score
  - side mapping is correct
  - missing wrists or too few frames gives `poor_quality`
- Add an integration test through `triage()`.

Commit and push.

### Task 8: `speech.ts`

- `speechScore(transcript, target) → CheckResult`. Also `speechTiming(amplitudes, sampleMs) → { speakingMs, pauseCount }`.
- Properties:
  - identical text scores 0
  - case and punctuation don't matter
  - the score is in [0, 1]
  - dropping words never lowers the score
  - an empty transcript gives `poor_quality`; no input gives `unavailable`
  - pause count and speaking duration are non-negative
- Add an integration test through `triage()`.

Commit and push.

### Task 9: Docs and final push

- `.kiro/specs/metrics/`: requirements (EARS, PBT-tagged), design (input data contracts for partner2) and tasks, all ticked.
- Tick the boxes in `.kiro/specs/triage-engine/tasks.md`.
- `structure.md`: add the metrics spec and the `tests/arbitraries.ts` file.
- `README.md`:
  - the required disclaimer
  - setup and test commands
  - an ownership table (us: scaffold, triage, metrics; partner2: vision, storage, routes, components, the other specs)
  - the input contracts partner2 calls
- `KIRO_LOG.md`: entries for the scaffold, engine and metrics, including what went wrong.
- Final run: `npm run check && npm run build && npx vitest --run && node scripts/safety-lint.mjs`, then commit and push to main.

**Demo:** CI is green on main, and partner2 can call `faceAsymmetry(...)` and then `triage(...)` and then `resultCopy(...)` from the README alone.
