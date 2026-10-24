// Normalization for every metric. Pure: no DOM, no MediaPipe, no Svelte.
// This is the ONLY place that knows about mirroring; everything downstream reports anatomical sides.
//
// Coordinates: pass PIXEL coordinates (MediaPipe x * videoWidth, y * videoHeight), not raw 0–1
// landmarks, otherwise a non-square frame distorts distances. y points down, as in images.
//
// MediaPipe labels landmarks by how the person APPEARS (facing the camera), so for an upright person:
//   - Face: 33 / 61 (the model's "right" eye / mouth corner) are on image-left; 263 / 291 on image-right.
//   - Pose: 12 / 16 (right shoulder / wrist) are on image-left; 11 / 15 (left) on image-right.
// Side "A" below always means image-left (33, 61, 12, 16); side "B" means image-right.
//
// A "frame" is defined by two reference points A→B (outer eye corners 33→263, or shoulders 12→11):
//   - origin: the midpoint of A and B          (translation invariance)
//   - angle:  the roll of the A→B line         (roll invariance; after normalizing, A→B is horizontal)
//   - scale:  |AB| (inter-ocular / shoulder width) (scale invariance; after normalizing, |AB| = 1)
// So after normalizing, A = (-0.5, 0) and B = (0.5, 0).
import type { Side } from '../triage/types.ts';

export interface Point {
  x: number;
  y: number;
}

export interface Frame {
  origin: Point;
  /** Radians. Roll of the A→B reference line, atan2(dy, dx). */
  angle: number;
  /** Length of A→B in input units (> 0). */
  scale: number;
  /** Cached for hot loops. */
  cos: number;
  sin: number;
}

const finite = (p: Point): boolean => Number.isFinite(p.x) && Number.isFinite(p.y);

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function midpoint(a: Point, b: Point, out: Point = { x: 0, y: 0 }): Point {
  out.x = (a.x + b.x) / 2;
  out.y = (a.y + b.y) / 2;
  return out;
}

/** Roll of the line a→b in radians. Zero when b is directly to the right of a. */
export function rollAngle(a: Point, b: Point): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

/**
 * Builds a normalization frame from two reference points, or returns null if it is degenerate
 * (coincident or non-finite points). Callers should treat null as a frame that could not be used.
 */
export function frameFrom(a: Point, b: Point): Frame | null {
  if (!finite(a) || !finite(b)) return null;
  const scale = distance(a, b);
  if (!(scale > 0) || !Number.isFinite(scale)) return null;
  const angle = rollAngle(a, b);
  return { origin: midpoint(a, b), angle, scale, cos: Math.cos(angle), sin: Math.sin(angle) };
}

/** Face frame from outer eye corners (landmarks 33 → 263): inter-ocular units, eye line horizontal. */
export const faceFrame = (eye33: Point, eye263: Point): Frame | null => frameFrom(eye33, eye263);

/**
 * Pose frame from the shoulders: shoulder-width units, shoulder line horizontal, y pointing down.
 * Built 12 → 11 (image-left → image-right) on purpose: 11 is MediaPipe's LEFT shoulder, which is on
 * image-right, so an 11 → 12 frame would rotate an upright person by π and turn "down" into "up".
 */
export const poseFrame = (shoulder11: Point, shoulder12: Point): Frame | null =>
  frameFrom(shoulder12, shoulder11);

/** Maps p into `frame`: translate to the origin, rotate by −angle, divide by scale. Writes into `out`. */
export function normalizePoint(p: Point, frame: Frame, out: Point = { x: 0, y: 0 }): Point {
  const dx = p.x - frame.origin.x;
  const dy = p.y - frame.origin.y;
  // Rotation by −angle: [cos sin; −sin cos].
  const x = (dx * frame.cos + dy * frame.sin) / frame.scale;
  const y = (-dx * frame.sin + dy * frame.cos) / frame.scale;
  out.x = x;
  out.y = y;
  return out;
}

/**
 * Normalizes every point into `frame`. Pass a reused `out` array in per-frame loops to avoid
 * allocations: existing Point objects in `out` are overwritten and the array is resized to fit.
 */
export function normalizePoints(points: readonly Point[], frame: Frame, out: Point[] = []): Point[] {
  for (let i = 0; i < points.length; i++) {
    out[i] = normalizePoint(points[i]!, frame, out[i]);
  }
  out.length = points.length;
  return out;
}

export function flipSide(side: Side): Side {
  return side === 'left' ? 'right' : 'left';
}

/**
 * Converts an IMAGE side (left/right of the frame passed to MediaPipe) to the person's ANATOMICAL side.
 *
 * `mirrored` = whether the frame given to MediaPipe was horizontally flipped (selfie view).
 * - Not mirrored (raw camera): the person faces the camera, so their right appears on image-left.
 * - Mirrored: image-left is the person's left.
 *
 * For a fixed `mirrored` this is an involution; flipping `mirrored` flips the result.
 */
export function toAnatomical(imageSide: Side, mirrored: boolean): Side {
  return mirrored ? imageSide : flipSide(imageSide);
}

/**
 * Anatomical side of side A (image-left: face landmarks 33 / 61, pose landmarks 12 / 16).
 * After normalizing, A sits at x = −0.5, i.e. image-left, so this is `toAnatomical('left', mirrored)`.
 */
export function anatomicalSideOfA(mirrored: boolean): Side {
  return toAnatomical('left', mirrored);
}

/** Anatomical side of side B (image-right: face 263 / 291, pose 11 / 15). Always opposite to A. */
export function anatomicalSideOfB(mirrored: boolean): Side {
  return toAnatomical('right', mirrored);
}

/**
 * Converts a signed "side A is weaker" value (positive = A weaker, negative = B weaker) into the
 * anatomical convention used by CheckResult.signed and baselines: positive = the person's LEFT is
 * weaker. Magnitude is unchanged, so |result| === |aMinusB|.
 */
export function toAnatomicalSigned(aMinusB: number, mirrored: boolean): number {
  // Written as a branch, not a multiply, so -0 never appears for a symmetric reading.
  if (aMinusB === 0) return 0;
  return anatomicalSideOfA(mirrored) === 'left' ? aMinusB : -aMinusB;
}

/**
 * Which side the MediaPipe blendshape suffix "Left" (mouthSmileLeft, eyeBlinkLeft, …) refers to.
 * Blendshapes are computed from the same landmarks, whose "left" is the model's left, i.e. the side of
 * 263 / 291 (side B). VERIFY LIVE: smile on one side only, unmirrored, and confirm `mouthSmileLeft` rises
 * when the side on image-right smiles. If it is the other way round, change this one constant to 'A'.
 */
export const BLENDSHAPE_LEFT_IS_SIDE: 'A' | 'B' = 'B';
