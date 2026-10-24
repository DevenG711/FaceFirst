// Arm drift score for the "A" in BE-FAST: both arms held out, eyes closed, ~10 s.
// Pure: no DOM, no MediaPipe, no Svelte.
//
// Each wrist is normalized into the shoulder frame (shoulder-width units, shoulder line horizontal,
// y down). An arm's drift is how far its wrist DROPPED between the start and the end of the hold:
//   drift = median(y over the last window) − median(y over the first window), floored at 0.
// The score is |drift(A) − drift(B)|, so both arms tiring equally scores ~0, and the side is the arm
// that dropped more. A = image-left (MediaPipe 12 / 16), B = image-right (11 / 15).
import { METRIC_PARAMS, QUALITY } from '../triage/thresholds.ts';
import type { CheckResult } from '../triage/types.ts';
import { median, okResult, poorQuality } from './checkResult.ts';
import { anatomicalSideOfA, anatomicalSideOfB, normalizePoint, poseFrame, type Point } from './geometry.ts';

/** A pose landmark in PIXEL coordinates. `visibility` is MediaPipe's 0–1 value, if available. */
export interface PoseLandmark extends Point {
  visibility?: number;
}

/**
 * One video frame of pose data (PIXEL coordinates, landmark.x * videoWidth, landmark.y * videoHeight).
 * Pass `null` for the whole frame, or for a landmark, when it was not detected.
 */
export interface ArmFrameInput {
  shoulder11: PoseLandmark | null;
  shoulder12: PoseLandmark | null;
  wrist15: PoseLandmark | null;
  wrist16: PoseLandmark | null;
}

export interface ArmOptions {
  /** Whether the image given to MediaPipe was horizontally flipped. CSS-only mirroring of the preview is `false`. */
  mirrored: boolean;
}

const usable = (p: PoseLandmark | null): p is PoseLandmark =>
  p !== null &&
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  (p.visibility === undefined || p.visibility >= QUALITY.MIN_LANDMARK_VISIBILITY);

const tmp: Point = { x: 0, y: 0 };

/**
 * Framing state of one frame, for the pre-capture "fit" check:
 * - `shoulders`: no pose, or the shoulders are missing / unusable (step back).
 * - `wrists`: shoulders are fine but at least one wrist is missing / unusable (hold both arms out).
 * - `ok`: the frame is one `armDrift` would count.
 */
export type ArmFit = 'ok' | 'shoulders' | 'wrists';

export function armFit(f: ArmFrameInput | null): ArmFit {
  if (!f || !usable(f.shoulder11) || !usable(f.shoulder12) || !poseFrame(f.shoulder11, f.shoulder12)) {
    return 'shoulders';
  }
  if (!usable(f.wrist15) || !usable(f.wrist16)) return 'wrists';
  return 'ok';
}

/** Drop of one wrist between the first and last `k` samples, floored at 0 (rising is not drift). */
function drop(ys: readonly number[], k: number): number {
  return Math.max(0, median(ys.slice(-k)) - median(ys.slice(0, k)));
}

/**
 * Arm drift check. Score >= 0 in shoulder-width units (compare with POPULATION_THRESHOLD.arm).
 * A frame counts only if both shoulders and both wrists are usable; fewer than QUALITY.MIN_ARM_FRAMES
 * such frames gives `poor_quality`.
 */
export function armDrift(frames: readonly (ArmFrameInput | null)[], { mirrored }: ArmOptions): CheckResult {
  const yA: number[] = [];
  const yB: number[] = [];
  let firstUsable = -1;
  let lastUsable = -1;
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i]!;
    if (armFit(f) !== 'ok') continue;
    const frame = poseFrame(f!.shoulder11!, f!.shoulder12!)!;
    if (firstUsable === -1) firstUsable = i;
    lastUsable = i;
    yA.push(normalizePoint(f!.wrist16!, frame, tmp).y);
    yB.push(normalizePoint(f!.wrist15!, frame, tmp).y);
  }
  const n = yA.length;
  if (n < QUALITY.MIN_ARM_FRAMES) return poorQuality('arm');

  // Span gate: drift compares the start to the END of the hold, so the usable frames must cover enough
  // of the capture. If they all bunch into part of it (the subject dropped out of frame for the rest),
  // the end window is not the end of the hold — retry rather than trust a half-measured drift.
  if (frames.length > 0) {
    const span = (lastUsable - firstUsable + 1) / frames.length;
    if (span < QUALITY.MIN_ARM_FRAME_SPAN) return poorQuality('arm');
  }

  // Windows never overlap, so a wrist that keeps sinking can only raise its drift.
  const k = Math.max(1, Math.min(Math.floor(n * METRIC_PARAMS.ARM_WINDOW_FRACTION), Math.floor(n / 2)));
  const diff = drop(yA, k) - drop(yB, k);
  const side = diff > 0 ? anatomicalSideOfA(mirrored) : diff < 0 ? anatomicalSideOfB(mirrored) : null;
  return okResult('arm', Math.abs(diff), side);
}
