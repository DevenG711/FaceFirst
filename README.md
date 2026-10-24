# Sentra

> Sentra is a prototype for demonstration only. It is not a medical device and does not diagnose stroke. Commercial use would require clinical validation and FDA review.

A 60-second, escalate-only stroke-warning check (face, arm, speech) for caregivers and bystanders. It runs entirely in the browser. No video leaves the device.

## Setup

Requires Node ≥ 22.17.

```sh
npm install          # exact-pinned versions (.npmrc sets save-exact)
npm run dev          # local dev server
npm run build        # static build to build/ (adapter-static)
npm run check        # svelte-check + TypeScript (strict)
npm test             # vitest --run (never watch mode)
npm run lint:safety  # scripts/safety-lint.mjs
```

Before every commit: `npm run check && npm run build && npx vitest --run && node scripts/safety-lint.mjs`.

## Stack notes (SvelteKit 3)

- SvelteKit config lives in `vite.config.ts` via `sveltekit({ ... })`. There is no `svelte.config.js` (Kit 3 rejects it).
- `$lib` was removed in Kit 3. Import from `src/lib` with the `#lib/*` subpath alias declared in `package.json`, using explicit extensions: `import { t } from '#lib/i18n/index.ts'`.
- `tsconfig.json` extends `$app/tsconfig`, which `svelte-kit sync` generates.
- Vitest config is the `test` block in `vite.config.ts` (include `tests/**/*.test.ts`). No separate `vitest.config.ts`.
- TypeScript is pinned to 6.x because Kit 3.1 and svelte-check 4.7 declare `typescript ^6` as a peer.

## Ownership

| Area | Owner |
|---|---|
| Project scaffold, `src/lib/triage` (types, thresholds, engine, copy, banned words), `src/lib/metrics`, `tests/*` | Partner 1 (engine) |
| `src/lib/vision`, `src/lib/storage`, `src/routes`, `src/lib/components`, specs `face-check`, `arm-check`, `speech-check`, `ems-card`, `baseline` | Partner 2 |

The placeholder routes and `Call911Button.svelte` are minimal scaffolding. Restyle or replace them freely, but `Call911Button` must stay first in `+layout.svelte` with `href="tel:911"` (the safety lint enforces this).

## Calling the engine (input contracts)

Everything in `lib/metrics` and `lib/triage` is pure: plain data in, plain data out. Full details: `.kiro/specs/metrics/design.md` and `.kiro/specs/triage-engine/design.md`.

Rules for every metric:

- Points are **pixel** coordinates: `landmark.x * video.videoWidth`, `landmark.y * video.videoHeight`.
- Push `null` for a frame with no detection. It is skipped, and too few usable frames gives `poor_quality`.
- `mirrored` is whether the image passed to `detectForVideo` was flipped. If you only mirror the preview with CSS, pass `false`. Sides come back anatomical (`'left' | 'right'`).
- Collect frames during the capture, then call the metric once at the end.

```ts
import { faceAsymmetry, pickBlendshapes, type FaceFrameInput } from '#lib/metrics/faceAsymmetry.ts';
import { armDrift, type ArmFrameInput } from '#lib/metrics/armDrift.ts';
import { speechScore, speechTiming } from '#lib/metrics/speech.ts';
import { triage } from '#lib/triage/engine.ts';
import { resultCopy } from '#lib/triage/copy.ts';

// Face: per FaceLandmarker result
const W = video.videoWidth, H = video.videoHeight;
const px = (l: { x: number; y: number }) => ({ x: l.x * W, y: l.y * H });
const lm = res.faceLandmarks[0];
faceFrames.push(lm ? {
  eye33: px(lm[33]), eye263: px(lm[263]), mouth61: px(lm[61]), mouth291: px(lm[291]),
  blendshapes: pickBlendshapes(res.faceBlendshapes[0]?.categories ?? []),
} : null);
const face = faceAsymmetry(faceFrames, { mirrored: false });

// Arm: per PoseLandmarker result (keep visibility)
const p = poseRes.landmarks[0];
const pv = (l: { x: number; y: number; visibility?: number }) => ({ ...px(l), visibility: l.visibility });
armFrames.push(p ? { shoulder11: pv(p[11]), shoulder12: pv(p[12]), wrist15: pv(p[15]), wrist16: pv(p[16]) } : null);
const arm = armDrift(armFrames, { mirrored: false });

// Speech: transcript from Web Speech (null if unsupported/skipped), RMS samples (0–1) from an AnalyserNode
const { speakingMs, pauseCount } = speechTiming(rmsSamples, sampleMs);
const speech = speechScore(transcript, targetSentence, { speakingMs });

// Triage + copy
const result = triage({
  checks: { face, arm, speech },
  beFast: { balance: 'no', vision: 'unsure' },     // 'yes' | 'no' | 'unsure', any subset
  caregiverReports: [],                             // 'face_uneven' | 'arm_weak' | 'speech_wrong'
  baseline: null,                                   // or { face: 0.03, ... } from lib/storage
});
const copy = resultCopy(result, 'en');              // { title, body[], actions[], colorToken, keys, params }
```

`result.state` is always one of `CALL_911_NOW`, `CANNOT_RULE_OUT`, `RETRY_CAPTURE`. `result.retryChecks` lists what to redo. `result.baselineComparisons` feeds the EMS card. `colorToken` is `'act'` (red) or `'caution'` (amber); there is no green.

A skipped check or the caregiver-judgment path: use `{ id: 'speech', status: 'unavailable', score: null, side: null }` and pass the caregiver's answer in `caregiverReports`.

## Thresholds

Every threshold, quality gate and weight is in `src/lib/triage/thresholds.ts`. They are uncalibrated research placeholders. One open item needs a live camera: confirm `BLENDSHAPE_LEFT_IS_SIDE` in `src/lib/metrics/geometry.ts` (see `.kiro/specs/metrics/tasks.md`, task 6).
