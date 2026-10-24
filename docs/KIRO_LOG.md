# Kiro Log

A running journal of how we built FaceFirst with Kiro during Hackachusetts 2026. The `kiro-journal` hook appends an entry each time a spec task finishes, and we add manual entries for setup work. This file is the source for the Kiro write-up.

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
