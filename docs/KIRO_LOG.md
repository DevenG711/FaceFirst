# Kiro Log

A running journal of how we built Sentra (working name: FaceFirst) with Kiro during Hackachusetts 2026. The `kiro-journal` hook appends an entry each time a spec task finishes, and we add manual entries for setup work. This file is the source for the Kiro write-up.

## Kiro setup at a glance

| Kiro feature | Where | What it does for us |
|---|---|---|
| Steering | `.kiro/steering/` | `product`, `tech`, `structure`, `safety` (always included); `design` (included only for `.svelte`/`.css`/`.json` files) |
| Specs | `.kiro/specs/` | One per feature, EARS requirements, PBT-tagged acceptance criteria. Order: triage-engine → face-check → arm-check → speech-check → ems-card → baseline |
| Hooks | `.kiro/hooks/` | `test-on-save`, `safety-lint-on-save`, `safety-lint-after-agent-edit`, `translation-sync`, `kiro-journal`, `a11y-check-new-component` |
| MCP | `.kiro/settings/mcp.json` (template: `docs/mcp.example.json`) | Playwright (end-to-end checks + screenshots of the live app), GitHub (issues/PRs), Context7 (current MediaPipe / SvelteKit docs) |
| Property-based testing | `tests/*.property.test.ts` | fast-check proofs of the safety rules (no reassurance, monotonicity, quality never less urgent) |
| Kiro CLI | `.github/workflows/ci.yml` | Runs tests + safety lint on every push; headless Kiro CLI safety review on PRs |
| Powers | IDE Powers panel | _Record which were installed and why._ |
| Parallel agents | Kiro Web / second session | _Record what ran in parallel and why._ |

## Entries

### 2026-10-24 11:10 — Setup: steering + triage-engine spec
- **Built:** Five steering docs from the build plan. Wrote the `triage-engine` spec (requirements in EARS format, design, tasks).
- **Kiro features used:** Steering (`safety.md` is always included, so every later agent action inherits the escalate-only rules). Spec workflow. Introspect sub-agent to confirm MCP/CLI/hook syntax.
- **Went wrong / changed:** The plan's rule that "baseline deviation is used" could let a baseline *lower* urgency. The spec now flags on population OR baseline deviation, so adding a baseline never lowers urgency, and there's a property test for it (P8).

### 2026-10-24 11:25 — Setup: hooks, MCP, safety lint, CI
- **Built:** `scripts/safety-lint.mjs` (no dependencies; banned words, 911 button, green on result screens, uncalibrated thresholds, `.kiro` not gitignored). `src/lib/triage/bannedWords.json` is the single source of banned words. Six hooks, `mcp.json`, `.gitignore`, CI workflow.
- **Kiro features used:** `createHook` for all hooks. Safety lint runs both on human saves (PostFileSave) and after agent edits (PostToolUse), so agent-written copy gets the same check.
- **Went wrong / changed:** The test-on-save hook used bash-only `PIPESTATUS`; replaced it with a portable command. Ran the safety lint against planted violations to make sure it can actually fail: it caught "You’re fine" (curly apostrophe), Portuguese "Você está bem", and `.kiro/` in `.gitignore`, and it correctly allowed "abnormal".
- **Tests:** Safety lint passes on the current repo.

### 2026-10-24 12:10 — Shared project scaffold (Partner 1)
- **Built:** Full `package.json` for both partners with exact pins (SvelteKit 3.1, Svelte 5.57, Vite 8.3, Vitest 5.0, fast-check 4.10, MediaPipe tasks-vision 1.1.1, idb-keyval 6.3, TypeScript 6.0.3), `.npmrc` (`save-exact`, `engine-strict`), `vite.config.ts` (Kit plugin config + Vitest `test` block), strict `tsconfig.json`, design tokens in `app.css`, a minimal `+layout.svelte` that renders `Call911Button` first, a home page showing the disclaimer, and a tiny i18n helper with `en/es/pt.json`.
- **Kiro features used:** Autopilot. The a11y hook reviewed each new component (moved the hard-coded home title into i18n). The translation-sync hook kept es/pt keys aligned. The safety lint ran after edits.
- **Went wrong / changed:** The latest packages turned out to be SvelteKit 3. It rejects `svelte.config.js`, so config moved into `sveltekit({...})` in `vite.config.ts`. It removed `$lib`, so we use the `#lib/*` subpath import in `package.json`. The tsconfig now extends `$app/tsconfig`. TypeScript 7 doesn't satisfy Kit's `^6` peer, so we pinned 6.0.3. The adapter's `index.html` fallback overwrote the prerendered home page, so the fallback is now `200.html`.
- **Tests:** `npm run check` 0 errors, `npm run build` OK (prerendered home has the 911 link first), `npx vitest --run` 4/4, safety lint OK.

### 2026-10-24 12:50 — Result copy + copy-safety tests (Partner 1, Task 4)
- **Built:** Finished the result copy on top of partner2's `copyandui` work. `result.call911Line` is now its own key and is appended to the `CANNOT_RULE_OUT` and `RETRY_CAPTURE` bodies. Flagged face/arm checks name the anatomical side (`result.reason.checkSided.*`, `result.side.*`) in en/es/pt. `resultCopy()` now also returns `params`, and `copy.ts` re-exports `t()`.
- **Tests:** Added C1b (every reachable key resolves, with no raw keys or unfilled `{placeholders}`). C2 now checks for the localized call-911 line plus the exact English sentence from `safety.md`. Added a sided-reason example. We planted "You’re fine" (curly apostrophe) in `result.retry.title`: C1, C3 and the safety lint all failed, and we reverted it. Result: 37/37 tests, `npm run check` 0 errors, lint OK.
- **Went wrong / changed:** The plan and Req 7.3 asked for "Re-check in 5 minutes". That conflicts with `safety.md` §2 because it suggests waiting. We kept the untimed re-check ("Don't wait if you have symptoms. Call 911.") and reworded Req 7.3 to match. No `result.recheck5min` key exists.

### 2026-10-24 12:55 — `geometry.ts` + geometry properties (Partner 1, Task 5)
- **Built:** `src/lib/metrics/geometry.ts`. It has `frameFrom`, `faceFrame` (33→263) and `poseFrame` (11→12), which give origin, roll and scale. It also has `normalizePoint` and `normalizePoints`, which write into caller buffers so per-frame loops don't allocate. `toAnatomical`, `flipSide` and `anatomicalSideOfA` live here, and this is the only module that knows about mirroring. Degenerate frames (coincident or non-finite points) return `null` instead of dividing by zero.
- **Tests:** `tests/metrics.property.test.ts`, 1000 runs each. Derotation makes the eye line horizontal and unit length. A random similarity transform (scale, rotate, translate) leaves normalized points unchanged. `toAnatomical` is an involution, and flipping `mirrored` flips the side. Degenerate frames are rejected, and output buffers are reused. Result: 44/44 tests, check 0 errors, build OK, lint OK.
- **Went wrong / changed:** The plan's property says "applied twice with flipped `mirrored` returns the original". Read literally, that is false: it returns the opposite side. We split it into two true properties (involution in a fixed mode, and flipping the mode flips the side). `noUncheckedIndexedAccess` needed `!` on two indexed reads. Partner2 must pass pixel coordinates, not raw 0–1 landmarks, because non-square frames distort distances. This is documented in the file header.

### 2026-10-24 13:10 — Review of Tasks 1–5 (Partner 1)

- **Checked:** Re-ran `npm run check` (0 errors), `npm run build`, `npx vitest --run` (44/44) and the safety lint on the `engine` branch. Repeated the Task 4 demo: we planted "You’re fine" in `result.retry.title`, and C1, C3 and the lint all failed, then we reverted it.
- **Went wrong / changed:** `main` has a revert of the engine commit (8f6d541), so Tasks 2–5 exist only on `engine` and still need a PR into `main`. A real bug turned up in `geometry.ts`: `poseFrame` was built 11 → 12. MediaPipe's 11 is the LEFT shoulder, which sits on image-right, so that frame rotated an upright person by π and turned "wrist dropped" into "wrist rose". It is now 12 → 11, and a new test covers it. We also added `anatomicalSideOfB` and `BLENDSHAPE_LEFT_IS_SIDE`, so the blendshape Left/Right convention lives in geometry.ts as one switch.

### 2026-10-24 13:30 — Metrics: face, arm, speech (Partner 1, Tasks 6–8)

- **Built:** `faceAsymmetry.ts` (signed per-frame droop plus weighted blendshape differences, scored as |median|, with `pickBlendshapes` for MediaPipe categories). `armDrift.ts` (wrist drop between non-overlapping start/end windows in shoulder units, floored at 0; the score is the difference between the arms). `speech.ts` (LCS word accuracy with accent, case and punctuation folding; `speechTiming` gives speaking ms and pauses between speech). The weights, arm window and visibility gate are new entries in `thresholds.ts` (`METRIC_PARAMS`, `QUALITY.MIN_LANDMARK_VISIBILITY`), all marked uncalibrated. `.kiro/specs/metrics/` holds the requirements, design and tasks.
- **Tests:** `tests/metricChecks.property.test.ts` has 29 tests: every property from the plan, plus one `triage()` integration test per check (face and arm droop on the left give `CALL_911_NOW` naming `left`). 73/73 tests pass, check 0 errors, build OK, lint OK.
- **Went wrong / changed:** All tests passed on the first run, so we mutation-tested. Two arm mutations survived (removing the scale normalization, removing the floor). The cause was that `fc.double` biases toward ~0, so almost every generated arm hold was flat and every score was ~1e-300. We fixed the generator (integer-based start + ramp + jitter) and added a "rising arm is not drift" test. After that, every mutation fails a test. Two plan properties ("lowering one mouth corner / more drift on one arm never lowers the score") are false as written, because changing the stronger side makes the person more symmetric. We restated them for the weaker side. We used LCS instead of WER for speech, because under WER "dropping words never lowers the score" is false.
- **Open:** `BLENDSHAPE_LEFT_IS_SIDE` is an assumption (that "Left" means the model's left, i.e. image-right in a raw camera frame). It needs a live one-sided smile to confirm. An arm that drops out of frame gives `poor_quality` → `RETRY_CAPTURE` rather than red; the caregiver "arm weak" button covers that case.
