---
inclusion: always
---

# Repo Structure

```
/.kiro/
  steering/  product.md  tech.md  structure.md  safety.md  design.md
  specs/     triage-engine/  metrics/  face-check/  arm-check/  speech-check/  ems-card/  baseline/
  hooks/
  settings/mcp.json
/src/
  lib/vision/    faceLandmarker.ts  poseLandmarker.ts  quality.ts  camera.ts
  lib/metrics/   faceAsymmetry.ts  armDrift.ts  speech.ts  geometry.ts  checkResult.ts
  lib/triage/    engine.ts  thresholds.ts  types.ts  copy.ts  bannedWords.ts  bannedWords.json
  lib/storage/   baselines.ts
  lib/i18n/      en.json  es.json  pt.json
  lib/components/  (shared UI, incl. Call911Button.svelte)
  routes/        +layout.svelte  +page.svelte (home)  check/  result/  card/  baseline/
/tests/
  arbitraries.ts  (shared fast-check generators for TriageInput)
  metrics.property.test.ts  (geometry)  metricChecks.property.test.ts  (face, arm, speech)
  triage.property.test.ts  copy-safety.test.ts  scaffold.test.ts
/docs/  KIRO_LOG.md  DEMO_SCRIPT.md
README.md
```

## Layering rules

| Layer | May import | Must not import |
|---|---|---|
| `lib/triage` | `lib/triage/*` only | DOM, Svelte, MediaPipe, storage, metrics internals |
| `lib/metrics` | `lib/metrics/*`, `lib/triage/types.ts`, `lib/triage/thresholds.ts` | DOM, Svelte, MediaPipe |
| `lib/vision` | MediaPipe, browser APIs, `lib/metrics` | `lib/triage/engine.ts` |
| `lib/storage` | `idb-keyval`, `lib/triage/types.ts` | Svelte |
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
