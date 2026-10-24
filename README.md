# FaceFirst

> FaceFirst is a prototype for demonstration only. It is not a medical device and does not diagnose stroke. Commercial use would require clinical validation and FDA review.

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

## Stack notes (SvelteKit 3)

- SvelteKit config lives in `vite.config.ts` via `sveltekit({ ... })`. There is no `svelte.config.js` (Kit 3 rejects it).
- `$lib` was removed in Kit 3. Import from `src/lib` with the `#lib/*` subpath alias declared in `package.json`, using explicit extensions: `import { t } from '#lib/i18n/index.ts'`.
- `tsconfig.json` extends `$app/tsconfig`, which `svelte-kit sync` generates.
- Vitest config is the `test` block in `vite.config.ts` (include `tests/**/*.test.ts`). No separate `vitest.config.ts`.
- TypeScript is pinned to 6.x because Kit 3.1 and svelte-check 4.7 declare `typescript ^6` as a peer.

## Ownership

| Area | Owner |
|---|---|
| Project scaffold, `src/lib/triage` types/thresholds/engine, `tests/arbitraries.ts`, `tests/triage.property.test.ts`, pure `src/lib/metrics` | Partner 1 (engine) |
| `bannedWords.ts`, `result.*` i18n copy, `copy.ts`, `tests/copy-safety.test.ts` (see `docs/workflows/PARTNER2_COPY.md`) | Partner 2 (copy) |

The placeholder routes and `Call911Button.svelte` are minimal scaffolding. Restyle or replace them freely, but `Call911Button` must stay first in `+layout.svelte` with `href="tel:911"` (the safety lint enforces this).
