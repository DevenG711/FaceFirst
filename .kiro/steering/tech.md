---
inclusion: always
---

# Tech Stack

## Core

- SvelteKit + TypeScript (strict mode), `@sveltejs/adapter-static`, deployed to Vercel.
- No backend. No server routes, no API endpoints, no database. Everything runs in the browser.
- Storage: IndexedDB via `idb-keyval` (baselines only).
- Tests: Vitest + fast-check. Run once with `npx vitest --run`, never in watch mode from the agent.
- Overlays: Canvas 2D.
- Pin exact dependency versions in `package.json`.

## Vision: MediaPipe Tasks Vision (pretrained, do not train models)

- Package: `@mediapipe/tasks-vision`. Load WASM via `FilesetResolver.forVisionTasks(<official CDN>)` and `.task` model files from Google storage.
- `FaceLandmarker`: `runningMode: "VIDEO"`, `numFaces: 1`, `outputFaceBlendshapes: true`, `outputFacialTransformationMatrixes: true`.
  - Landmarks used: outer eye corners 33 / 263, mouth corners 61 / 291.
  - Blendshapes used: `mouthSmileLeft/Right`, `mouthFrownLeft/Right`, `eyeBlinkLeft/Right`, `browDownLeft/Right`.
- `PoseLandmarker` (lite model): shoulders 11/12, elbows 13/14, wrists 15/16.
- Try `delegate: "GPU"` first, fall back to `"CPU"` on failure.
- Drive inference with `video.requestVideoFrameCallback` and pass its `mediaTime`-derived timestamp (ms, strictly increasing) to `detectForVideo`.
- Selfie video is mirrored. Convert to anatomical left/right in one place (`lib/metrics/geometry.ts`) and report sides anatomically everywhere else.
- When unsure of the current API, fetch the MediaPipe docs via the docs/fetch MCP rather than guessing.

## Speech

- Web Speech API (`SpeechRecognition ?? webkitSpeechRecognition`) for transcripts. Feature-detect; fall back to caregiver judgment buttons.
- Web Audio `AnalyserNode` for speaking duration and pause count.
- `speechSynthesis` for voice prompts in the active language.
- Stretch: on-device Whisper via `transformers.js`.

## Performance budget

- ≥ 20 fps face tracking on a MacBook Air (Chrome). Measure and log fps in dev builds.
- Home screen interactive in < 2 s on 4G; lazy-load MediaPipe WASM and models only when a check starts.
- Never block the main thread with per-frame allocations in hot loops; reuse buffers.

## Coding rules

- `lib/metrics` and `lib/triage` are pure TypeScript functions: no DOM, no `window`, no MediaPipe imports, no Svelte. They take plain data and return plain data so they can be property-tested.
- All thresholds come from `lib/triage/thresholds.ts`.
- All user-facing strings come from `lib/i18n/*.json`; no hard-coded copy in components.
