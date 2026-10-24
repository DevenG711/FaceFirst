// Pipeline fixtures now live in the shared module src/lib/dev/scenarios.ts so the app's dev harness /
// /simulate page and these Vitest fixtures replay the SAME synthetic clips through the SAME real
// metrics. This file stays as the test's import path (re-export only) — see that module for the docs.
export {
  rng,
  faceClip,
  armClip,
  FACE_SCENARIOS,
  ARM_SCENARIOS,
  type FaceClipSpec,
  type ArmClipSpec,
} from '#lib/dev/scenarios.ts';
