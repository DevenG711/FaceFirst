---
inclusion: always
---

# Repo Structure

```
/.kiro/
  steering/  product.md  tech.md  structure.md  safety.md  design.md
  specs/     triage-engine/  metrics/  check-flow/  speech-check/
  hooks/
  settings/mcp.json
/src/
  lib/vision/    index.ts (landmarkers, waitForFit, runCameraCheck)  mapFrames.ts (pure MediaPipe → metric inputs)
  lib/metrics/   faceAsymmetry.ts  armDrift.ts  speech.ts  geometry.ts  checkResult.ts
  lib/triage/    engine.ts  thresholds.ts  types.ts  copy.ts  bannedWords.ts  bannedWords.json
  lib/storage/   baselines.ts (personal baseline, local IndexedDB only)
  lib/stores/    session.ts (in-memory session state)
  lib/dev/       scenarios.ts  testHarness.ts (dev-only, window.facefirst)
  lib/i18n/      index.ts  en.json  es.json  pt.json
  lib/components/  Call911Button  CameraCheck  CameraView  FaceGuide  FlowProgress
  lib/voice.ts   speechSynthesis prompts
  routes/        +layout.svelte  +page.svelte (home)  check/{face,arm,speech,befast}  result/  baseline/  simulate/ (dev only)
/static/mediapipe/wasm/  vendored MediaPipe WASM (same-origin)
/scripts/safety-lint.mjs
/tests/
  arbitraries.ts  (shared fast-check generators for TriageInput)  fixtures/clips.ts
  metrics.property.test.ts  (geometry)  metricChecks.property.test.ts  (face, arm, speech)
  speechAcoustics.property.test.ts  speechMetric.test.ts  vision-mapping.test.ts  pipeline.fixture.test.ts
  triage.property.test.ts  copy-safety.test.ts  scaffold.test.ts
/docs/  KIRO_LOG.md  mcp.example.json  workflows/
README.md
```

## Layering rules

| Layer | May import | Must not import |
|---|---|---|
| `lib/triage` | `lib/triage/*` only | DOM, Svelte, MediaPipe, storage, metrics internals |
| `lib/metrics` | `lib/metrics/*`, `lib/triage/types.ts`, `lib/triage/thresholds.ts` | DOM, Svelte, MediaPipe |
| `lib/vision` | MediaPipe, browser APIs, `lib/metrics` | `lib/triage/engine.ts` |
| `lib/storage` | `idb-keyval`, `lib/triage/types.ts` | Svelte |
| `lib/stores`, `lib/dev` | `lib/*` | — (`lib/dev` loads only when `import.meta.env.DEV`) |
| `routes`, `components` | anything in `lib` | — |

- `metrics` and `triage` are pure functions with no side effects and no DOM access. This is what makes them property-testable.
- `geometry.ts` owns normalization: roll correction, inter-ocular scaling, shoulder-width scaling, mirror → anatomical side mapping.
- `thresholds.ts` is the only place numeric thresholds live.
- `Call911Button.svelte` is rendered once in `+layout.svelte` so it appears on every route and is first in tab order.

## Naming

- Files: `camelCase.ts`; Svelte components `PascalCase.svelte`.
- Tests: `*.property.test.ts` for fast-check suites, `*.test.ts` for example-based.
- i18n keys: dot-namespaced (`home.start`, `result.call911.title`, `card.timeNoticed`).
- Sides are typed as `'left' | 'right'` in anatomical terms, never "screen left".
