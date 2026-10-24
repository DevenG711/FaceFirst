// Synthetic "clip" fixtures: MediaPipe-shaped landmark sequences for named clinical scenarios.
//
// SHARED between the Vitest pipeline fixtures (tests/fixtures/clips.ts re-exports this) and the
// in-app dev harness / /simulate page. One definition, so a manual test on /simulate and an automated
// fixture test replay the EXACT same landmark data through the EXACT same real metrics. This file is
// pure data generation (no DOM, no Svelte, no MediaPipe import — structural types only), so it is safe
// to import from both app code and the node test env.
//
// WHY SYNTHETIC
// -------------
// We cannot ship real patient video (privacy, licensing) and cannot run the camera pipeline in the
// node test env. So we generate landmark streams in the EXACT structural shape MediaPipe emits for
// clinically-named scenarios, then run them through the real mapFrames + metrics. These are
// DETERMINISTIC and seeded — a failure always reproduces. Numbers are geometric guesses chosen to sit
// clearly above/below the UNCALIBRATED thresholds in thresholds.ts; they are not clinical data.
// See .kiro/steering/safety.md.
import type { FaceResultLike, PoseResultLike, NormLandmark } from '#lib/vision/mapFrames.ts';

// ---------------------------------------------------------------------------
// Tiny deterministic PRNG (mulberry32) so "noisy" clips are reproducible.
// ---------------------------------------------------------------------------
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// FACE clips
// ---------------------------------------------------------------------------
const FACE_BLENDSHAPE_NAMES = [
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthFrownLeft',
  'mouthFrownRight',
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'browDownLeft',
  'browDownRight',
] as const;

export interface FaceClipSpec {
  /** Vertical offset (normalized units) added to the image-LEFT mouth corner (landmark 61). + = droops. */
  leftMouthDrop?: number;
  /** Vertical offset added to the image-RIGHT mouth corner (landmark 291). + = droops. */
  rightMouthDrop?: number;
  /** Per-frame jitter amplitude (normalized units) added to every point. 0 = perfectly still. */
  jitter?: number;
  /** Fraction of frames where NO face is detected (dropped frames). 0..1. */
  dropRate?: number;
  /** Blendshape overrides, e.g. { mouthSmileRight: 0.6 }. Unset names default to 0. */
  blendshapes?: Partial<Record<(typeof FACE_BLENDSHAPE_NAMES)[number], number>>;
  frames?: number;
  seed?: number;
}

function fullFaceLandmarks(set: Record<number, NormLandmark>): NormLandmark[] {
  const arr: NormLandmark[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5 }));
  for (const [i, l] of Object.entries(set)) arr[Number(i)] = l;
  return arr;
}

/** A sequence of FaceLandmarker-shaped results. `null` entries (dropped frames) can be included. */
export function faceClip(spec: FaceClipSpec = {}): (FaceResultLike | null)[] {
  const frames = spec.frames ?? 40;
  const jitter = spec.jitter ?? 0;
  const dropRate = spec.dropRate ?? 0;
  const next = rng(spec.seed ?? 1);
  const cats = FACE_BLENDSHAPE_NAMES.map((categoryName) => ({
    categoryName,
    score: spec.blendshapes?.[categoryName] ?? 0,
  }));

  const out: (FaceResultLike | null)[] = [];
  for (let i = 0; i < frames; i++) {
    if (dropRate > 0 && next() < dropRate) {
      out.push(null);
      continue;
    }
    const j = () => (jitter ? (next() - 0.5) * 2 * jitter : 0);
    out.push({
      faceLandmarks: [
        fullFaceLandmarks({
          33: { x: 0.4 + j(), y: 0.5 + j() }, // outer eye, image-left
          263: { x: 0.6 + j(), y: 0.5 + j() }, // outer eye, image-right
          61: { x: 0.45 + j(), y: 0.7 + (spec.leftMouthDrop ?? 0) + j() }, // mouth, image-left
          291: { x: 0.55 + j(), y: 0.7 + (spec.rightMouthDrop ?? 0) + j() }, // mouth, image-right
        }),
      ],
      faceBlendshapes: [{ categories: cats }],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// ARM clips
// ---------------------------------------------------------------------------
export interface ArmClipSpec {
  /** Total downward drift (normalized units) of the image-LEFT wrist (landmark 16) over the clip. */
  leftWristDrift?: number;
  /** Total downward drift of the image-RIGHT wrist (landmark 15) over the clip. */
  rightWristDrift?: number;
  jitter?: number;
  /** Visibility reported for every landmark (MediaPipe pose). Below QUALITY gate => treated as missing. */
  visibility?: number;
  /** Fraction of frames with no pose detected. */
  dropRate?: number;
  frames?: number;
  seed?: number;
}

function fullPoseLandmarks(set: Record<number, NormLandmark>): NormLandmark[] {
  const arr: NormLandmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.9 }));
  for (const [i, l] of Object.entries(set)) arr[Number(i)] = l;
  return arr;
}

export function armClip(spec: ArmClipSpec = {}): (PoseResultLike | null)[] {
  const frames = spec.frames ?? 80;
  const jitter = spec.jitter ?? 0;
  const dropRate = spec.dropRate ?? 0;
  const vis = spec.visibility ?? 0.9;
  const next = rng(spec.seed ?? 2);

  const out: (PoseResultLike | null)[] = [];
  for (let i = 0; i < frames; i++) {
    if (dropRate > 0 && next() < dropRate) {
      out.push(null);
      continue;
    }
    const t = frames > 1 ? i / (frames - 1) : 0; // 0 at start, 1 at end
    const j = () => (jitter ? (next() - 0.5) * 2 * jitter : 0);
    out.push({
      landmarks: [
        fullPoseLandmarks({
          11: { x: 0.6 + j(), y: 0.4 + j(), visibility: vis }, // shoulder, image-right (model left)
          12: { x: 0.4 + j(), y: 0.4 + j(), visibility: vis }, // shoulder, image-left (model right)
          15: { x: 0.65 + j(), y: 0.6 + (spec.rightWristDrift ?? 0) * t + j(), visibility: vis }, // wrist, image-right
          16: { x: 0.35 + j(), y: 0.6 + (spec.leftWristDrift ?? 0) * t + j(), visibility: vis }, // wrist, image-left
        }),
      ],
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Named scenario library — the actual "fixtures".
// Each is a clinically-named case with the expected pipeline verdict documented.
// ---------------------------------------------------------------------------
export const FACE_SCENARIOS = {
  /** Symmetric face, still camera. Expect: low score, NOT flagged. */
  healthy: (): (FaceResultLike | null)[] => faceClip({ seed: 10 }),

  /** Image-left mouth corner droops well past threshold. Expect: flagged, anatomical side resolved. */
  leftDroop: (): (FaceResultLike | null)[] =>
    faceClip({ leftMouthDrop: 0.06, blendshapes: { mouthSmileRight: 0.5 }, seed: 11 }),

  /** Image-right mouth corner droops. Expect: flagged, opposite side to leftDroop. */
  rightDroop: (): (FaceResultLike | null)[] =>
    faceClip({ rightMouthDrop: 0.06, blendshapes: { mouthSmileLeft: 0.5 }, seed: 12 }),

  /** Healthy but shaky hands/head: jitter but no real asymmetry. Expect: still NOT flagged. */
  healthyNoisy: (): (FaceResultLike | null)[] => faceClip({ jitter: 0.01, seed: 13 }),

  /** Face barely tracked — most frames dropped. Expect: poor_quality -> RETRY_CAPTURE. */
  poorTracking: (): (FaceResultLike | null)[] => faceClip({ dropRate: 0.95, seed: 14 }),

  /**
   * Enough frames, but the subject keeps turning so readings split left/right with a near-zero median.
   * Expect: the sign-agreement gate routes this to poor_quality (retry), NOT a false "clean face".
   * Built by hand: alternate small left-lean and right-lean frames.
   */
  ambiguousTurning: (): (FaceResultLike | null)[] => {
    const left = faceClip({ leftMouthDrop: 0.02, frames: 20, seed: 15 });
    const right = faceClip({ rightMouthDrop: 0.02, frames: 20, seed: 16 });
    const out: (FaceResultLike | null)[] = [];
    for (let i = 0; i < 20; i++) {
      out.push(left[i]!, right[i]!);
    }
    return out;
  },
} as const;

export const ARM_SCENARIOS = {
  /** Both arms steady. Expect: low score, NOT flagged. */
  healthy: (): (PoseResultLike | null)[] => armClip({ seed: 20 }),

  /** Image-left wrist sinks hard, other steady. Expect: flagged on a definite side. */
  leftDrift: (): (PoseResultLike | null)[] => armClip({ leftWristDrift: 0.35, seed: 21 }),

  /** Image-right wrist sinks. Expect: flagged, opposite side to leftDrift. */
  rightDrift: (): (PoseResultLike | null)[] => armClip({ rightWristDrift: 0.35, seed: 22 }),

  /** Both arms tire equally (both sink the same). Expect: NOT flagged (difference ~0). */
  bothTireEqually: (): (PoseResultLike | null)[] =>
    armClip({ leftWristDrift: 0.3, rightWristDrift: 0.3, seed: 23 }),

  /** Wrists below the visibility gate most of the clip. Expect: poor_quality -> RETRY_CAPTURE. */
  lowVisibility: (): (PoseResultLike | null)[] => armClip({ visibility: 0.2, seed: 24 }),

  /**
   * Plenty of usable frames, but they all bunch in the first third — the subject dropped out of frame
   * for the rest of the hold. The end window is not the real end. Expect: span gate -> poor_quality.
   */
  bunchedAtStart: (): (PoseResultLike | null)[] => {
    const good = armClip({ leftWristDrift: 0.35, frames: 70, seed: 25 });
    const gone: (PoseResultLike | null)[] = Array.from({ length: 140 }, () => null);
    return [...good, ...gone];
  },
} as const;
