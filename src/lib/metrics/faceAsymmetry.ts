// Face asymmetry score for the "F" in BE-FAST. Pure: no DOM, no MediaPipe, no Svelte.
//
// Per frame we compute a SIGNED asymmetry, positive when side A (image-left: landmarks 33 / 61) looks
// weaker, negative when side B (image-right: 263 / 291) does:
//   droop  = y(61) − y(291) in the face frame (inter-ocular units, y down, eye line horizontal)
//   + blendshape differences, each signed toward "A is weaker" and weighted by METRIC_PARAMS.
// The check's score is |median of the signed values| and its side is the weaker side, anatomically.
// Using the median makes a few bad frames (a blink, a tracking glitch) irrelevant.
import { METRIC_PARAMS, QUALITY } from '../triage/thresholds.ts';
import type { CheckResult } from '../triage/types.ts';
import { median, okResult, poorQuality } from './checkResult.ts';
import {
  anatomicalSideOfA,
  anatomicalSideOfB,
  BLENDSHAPE_LEFT_IS_SIDE,
  faceFrame,
  normalizePoint,
  type Point,
} from './geometry.ts';

/** The eight MediaPipe blendshapes we use (see .kiro/steering/tech.md). */
export const FACE_BLENDSHAPES = [
  'mouthSmileLeft',
  'mouthSmileRight',
  'mouthFrownLeft',
  'mouthFrownRight',
  'eyeBlinkLeft',
  'eyeBlinkRight',
  'browDownLeft',
  'browDownRight',
] as const;
export type FaceBlendshape = (typeof FACE_BLENDSHAPES)[number];
export type FaceBlendshapes = Record<FaceBlendshape, number>;

/**
 * One video frame of face data. Points are PIXEL coordinates (landmark.x * videoWidth,
 * landmark.y * videoHeight). Pass `null` for a frame where no face was found; it is skipped.
 */
export interface FaceFrameInput {
  eye33: Point;
  eye263: Point;
  mouth61: Point;
  mouth291: Point;
  /** Values in [0, 1]. A frame missing any of the eight is skipped. */
  blendshapes: Partial<FaceBlendshapes>;
}

export interface FaceOptions {
  /** Whether the image given to MediaPipe was horizontally flipped. CSS-only mirroring of the preview is `false`. */
  mirrored: boolean;
}

/**
 * Converts MediaPipe's `faceBlendshapes[0].categories` (or any `{ categoryName, score }[]`) into the
 * record `FaceFrameInput` expects, keeping only the eight we use. Structural type, so no MediaPipe import.
 */
export function pickBlendshapes(
  categories: readonly { categoryName: string; score: number }[]
): Partial<FaceBlendshapes> {
  const out: Partial<FaceBlendshapes> = {};
  for (const c of categories) {
    if ((FACE_BLENDSHAPES as readonly string[]).includes(c.categoryName)) {
      out[c.categoryName as FaceBlendshape] = c.score;
    }
  }
  return out;
}

const pA: Point = { x: 0, y: 0 };
const pB: Point = { x: 0, y: 0 };

/** Signed asymmetry of one frame (positive = side A weaker), or null if the frame is unusable. */
export function frameAsymmetry(f: FaceFrameInput | null): number | null {
  if (!f) return null;
  const frame = faceFrame(f.eye33, f.eye263);
  if (!frame) return null;
  const b = f.blendshapes;
  for (const name of FACE_BLENDSHAPES) {
    if (!Number.isFinite(b[name])) return null;
  }
  if (!Number.isFinite(f.mouth61.x + f.mouth61.y + f.mouth291.x + f.mouth291.y)) return null;

  normalizePoint(f.mouth61, frame, pA);
  normalizePoint(f.mouth291, frame, pB);
  const droop = pA.y - pB.y; // y is down: positive = A's corner is lower

  // (side A value) − (side B value) for a blendshape pair. The Left/Right → A/B mapping lives in geometry.ts.
  const leftIsA = BLENDSHAPE_LEFT_IS_SIDE === 'A';
  const aMinusB = (n: 'mouthSmile' | 'mouthFrown' | 'eyeBlink' | 'browDown'): number => {
    const diff = b[`${n}Left`]! - b[`${n}Right`]!;
    return leftIsA ? diff : -diff;
  };

  return (
    droop -
    METRIC_PARAMS.FACE_WEIGHT_SMILE * aMinusB('mouthSmile') + // A smiles less
    METRIC_PARAMS.FACE_WEIGHT_FROWN * aMinusB('mouthFrown') + // A pulled down more
    METRIC_PARAMS.FACE_WEIGHT_BLINK * -aMinusB('eyeBlink') + // A closes less
    METRIC_PARAMS.FACE_WEIGHT_BROW * aMinusB('browDown') // A brow lower
  );
}

/**
 * Pre-capture state of one frame, for the "start when smiling" gate:
 * - `face`: no usable face (the frame faceAsymmetry would skip).
 * - `smile`: face is fine but not smiling yet.
 * - `ok`: smiling.
 *
 * SAFETY: "smiling" uses the STRONGER side (max of left/right). A face with one-sided weakness can
 * only smile on one side, and that must still start the capture; requiring both sides would stall
 * exactly the faces we most need to measure.
 */
export type FaceFit = 'ok' | 'face' | 'smile';

export function faceFit(f: FaceFrameInput | null): FaceFit {
  if (frameAsymmetry(f) === null) return 'face';
  const smile = Math.max(f!.blendshapes.mouthSmileLeft!, f!.blendshapes.mouthSmileRight!);
  return smile >= QUALITY.FACE_SMILE_START ? 'ok' : 'smile';
}

/**
 * Face asymmetry check. Score >= 0 in roughly inter-ocular units (compare with POPULATION_THRESHOLD.face).
 * Fewer than QUALITY.MIN_FACE_FRAMES usable frames gives `poor_quality`.
 */
export function faceAsymmetry(
  frames: readonly (FaceFrameInput | null)[],
  { mirrored }: FaceOptions
): CheckResult {
  const signed: number[] = [];
  for (const f of frames) {
    const s = frameAsymmetry(f);
    if (s !== null && Number.isFinite(s)) signed.push(s);
  }
  if (signed.length < QUALITY.MIN_FACE_FRAMES) return poorQuality('face');

  const m = median(signed);
  // Direction-agreement gate: a genuine one-sided droop makes most frames lean the same way. If the
  // frames DISAGREE on direction and the median is small, the capture is ambiguous (the subject moved
  // or was poorly tracked), so we RETRY instead of reporting a false near-zero. A clear droop
  // (|median| ≥ FACE_AMBIGUOUS_MAX) is never suppressed — safety: only ever becomes more cautious.
  if (Math.abs(m) < QUALITY.FACE_AMBIGUOUS_MAX) {
    // A frame only "votes" for a side if it leans by more than the noise floor; smaller readings are
    // floating-point dust or a practically-symmetric frame and are ignored. This keeps a truly
    // symmetric face (residuals ~1e-14 that split sign) from tripping the gate.
    const leaning = signed.filter((s) => Math.abs(s) > QUALITY.FACE_LEAN_EPSILON);
    if (leaning.length > 0) {
      const leaningToMedian = leaning.filter((s) => (m >= 0 ? s > 0 : s < 0)).length;
      const agreement = leaningToMedian / leaning.length;
      if (agreement < QUALITY.MIN_FACE_SIGN_AGREEMENT) return poorQuality('face');
    }
  }
  const side = m > 0 ? anatomicalSideOfA(mirrored) : m < 0 ? anatomicalSideOfB(mirrored) : null;
  return okResult('face', Math.abs(m), side);
}
