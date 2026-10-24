# Kiro Log

A running journal of how we built FaceFirst with Kiro during Hackachusetts 2026. The `kiro-journal` hook appends an entry each time a spec task finishes, and we add manual entries for setup work. This file is the source for the Kiro write-up.

## Kiro setup at a glance

| Kiro feature | Where | What it does for us |
|---|---|---|
| Steering | `.kiro/steering/` | `product`, `tech`, `structure`, `safety` (always included); `design` (included only for `.svelte`/`.css`/`.json` files) |
| Specs | `.kiro/specs/` | EARS requirements, test-tagged acceptance criteria, task lists. `triage-engine` and `metrics` were written before the code. `check-flow` and `speech-check` were written from the code afterwards, by parallel sub-agents, and list their own open tasks |
| Hooks | `.kiro/hooks/` | `test-on-save`, `safety-lint-on-save`, `safety-lint-after-agent-edit`, `translation-sync`, `kiro-journal`, `a11y-check-new-component` |
| MCP | `.kiro/settings/mcp.json` (template: `docs/mcp.example.json`) | Configured: Context7 (current MediaPipe / SvelteKit docs) and Playwright (browser checks) |
| Property-based testing | `tests/*.property.test.ts` | fast-check proofs of the safety rules (no reassurance, monotonicity, quality never less urgent) |
| CI | `.github/workflows/ci.yml` | Safety lint + all tests on every push and PR. A headless Kiro CLI safety review job is wired for PRs and runs once the `KIRO_API_KEY` repo secret is set |
| Kiro IDE | this repo | Spec-driven, supervised work on the safety-critical core: steering, specs, hooks, the triage engine, metrics and property tests |
| Kiro Crew | dashboard sessions on the same workspace | Long unattended runs: branch merges, wiring real vision, accuracy fixtures, the `/simulate` harness, PRs. Crew reads the same `.kiro/steering`, so its work follows the same safety rules. It tracked progress in its work ledger |
| Sub-agents | Kiro IDE | Context-gatherer and general-task sub-agents for investigation and parallel spec writing |

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

### 2026-10-24 13:15 to 14:36 — Kiro Crew: merge, real vision, UI polish (PRs #2, #3)
- **Built:** Crew merged `engine` and `copyandui` into `combined`. Then, while we were away, it ran on its own: it wired real MediaPipe face/pose detection into the metrics (`89e4e3f`), pulled out the pure frame mappers with tests (`2ae6de6`), built `/result` and `/baseline` (`b227383`), added the flow stepper and result typography, did a UI polish pass (`a8b8e82`) and opened PRs #2 and #3.
- **Kiro features used:** Kiro Crew from the dashboard, an unattended goal ("simple, accurate, good looking"), and its work ledger to track phases (implementing, then done). Steering is shared across the workspace, so the unattended run kept the 911-first, no-green and escalate-only rules.
- **Went wrong / changed:** We asked for many subagents. Crew's admission gate held them because the laptop was short on memory, so Crew did the work one step at a time. One probe subagent stayed queued and was stopped.

### 2026-10-24 14:50 to 15:26 — Kiro Crew: accuracy work, sensor-first flow (PR #4)
- **Built:** End-to-end fixture tests and capture-quality gates (`e03463f`). The flow is now sensor-first, with the BE-FAST questions optional (`887145f`). These were merged to `main` through PR #4.
- **Kiro features used:** Kiro Crew. The property tests caught a bug in its own gate: floating-point residuals (+1e-16 / −1e-16) on a symmetric face split in sign and tripped the gate, which broke "a symmetric face scores ~0". It fixed the gate rather than the test.
- **Went wrong / changed:** The tests prove the math and the wiring, not detection on real stroke faces. That gap is still open (see `check-flow` task 10).

### 2026-10-24 15:36 to 16:06 — Kiro Crew: dev test harness (`test-harness` branch)
- **Built:** `/simulate` and the `window.facefirst` console harness (`a4a2838`). Both replay seeded clips through the real `mapFrames`, metrics and `triage()`, without a camera. The clips are shared with `tests/pipeline.fixture.test.ts`. Both are dev only.
- **Kiro features used:** Kiro Crew, plus a local server for review.

### 2026-10-24 16:10 to 16:50 — Kiro Crew: live debugging from screenshots
- **Changed:** Dev builds now log each camera check's `CheckResult` to the console. From a screenshot of the arm step, Crew found that the person was framed too close (no shoulders or wrists), so arm drift read 0. It switched the arm camera to a wide landscape frame and rewrote the instruction.
- **Went wrong / changed:** We proposed combining the face and arm steps by holding the phone in the outstretched arm. Crew pushed back: when the arm drifts, the camera moves with it and the face slides out of frame. We kept two steps.

### 2026-10-24 — Kiro IDE: spec back-fill and repo audit
- **Built:** `.kiro/specs/check-flow/` and `.kiro/specs/speech-check/`, written from the implementation by two general-task sub-agents running in parallel. Each criterion is tagged only where a test really covers it, and each spec lists its open tasks. `structure.md` now matches the real tree. The MCP template (`docs/mcp.example.json`) dropped the unused GitHub server and fixed Context7's `autoApprove` tool name (`query-docs`).
- **Went wrong / changed:** The specs exposed drift from `tech.md`: `requestAnimationFrame` instead of `requestVideoFrameCallback`, no GPU→CPU fallback, no fps logging, a stale `speechErrorScore` comment, and the baseline not yet passed to `triage()`. These are open tasks now, not hidden.
