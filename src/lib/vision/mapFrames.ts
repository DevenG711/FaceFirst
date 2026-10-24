// Pure mappers from a MediaPipe detection result to the metric frame inputs. No DOM, no MediaPipe
// import (structural types only), no Svelte — so these are unit-testable in the node test env and
// are the single source of truth for WHICH landmark index feeds WHICH metric field, and for the
// pixel-coordinate conversion (landmark.x * videoWidth, landmark.y * videoHeight).
//
// Landmark indices (see .kiro/steering + lib/metrics/geometry.ts):
//   Face: 33 / 263 outer eye corners, 61 / 291 mouth corners.
//   Pose: 11 / 12 shoulders, 15 / 16 wrists.
import {
  pickBlendshapes,
  type FaceFrameInput,
} from '#lib/metrics/faceAsymmetry.ts';
import type { ArmFrameInput, PoseLandmark } from '#lib/metrics/armDrift.ts';

/** A normalized MediaPipe landmark (x, y in 0..1). */
export interface NormLandmark {
  x: number;
  y: number;
  visibility?: number;
}

/** Minimal structural shape of a FaceLandmarkerResult (one face). */
export interface FaceResultLike {
  faceLandmarks: NormLandmark[][];
  faceBlendshapes: { categories: { categoryName: string; score: number }[] }[];
}

/** Minimal structural shape of a PoseLandmarkerResult (one pose). */
export interface PoseResultLike {
  landmarks: NormLandmark[][];
}

const px = (l: NormLandmark, w: number, h: number) => ({ x: l.x * w, y: l.y * h });

/**
 * Maps one FaceLandmarker result to a FaceFrameInput, or null when no face was detected.
 * Points are converted to pixels with the given video dimensions.
 */
export function faceFrameFromResult(
  res: FaceResultLike,
  videoWidth: number,
  videoHeight: number
): FaceFrameInput | null {
  const lm = res.faceLandmarks[0];
  if (!lm) return null;
  return {
    eye33: px(lm[33]!, videoWidth, videoHeight),
    eye263: px(lm[263]!, videoWidth, videoHeight),
    mouth61: px(lm[61]!, videoWidth, videoHeight),
    mouth291: px(lm[291]!, videoWidth, videoHeight),
    blendshapes: pickBlendshapes(res.faceBlendshapes[0]?.categories ?? []),
  };
}

/**
 * Maps one PoseLandmarker result to an ArmFrameInput, or null when no pose was detected.
 * A missing individual landmark becomes null for that field (the metric skips it).
 */
export function armFrameFromResult(
  res: PoseResultLike,
  videoWidth: number,
  videoHeight: number
): ArmFrameInput | null {
  const p = res.landmarks[0];
  if (!p) return null;
  const pv = (l: NormLandmark | undefined): PoseLandmark | null =>
    l ? { ...px(l, videoWidth, videoHeight), visibility: l.visibility } : null;
  return {
    shoulder11: pv(p[11]),
    shoulder12: pv(p[12]),
    wrist15: pv(p[15]),
    wrist16: pv(p[16]),
  };
}
