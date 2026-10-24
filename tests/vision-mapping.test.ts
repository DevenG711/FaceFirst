// Accuracy tests for the vision→metric mapping (src/lib/vision/mapFrames.ts). These are the glue
// where a wrong landmark index, a missing pixel conversion, or a dropped blendshape would silently
// corrupt every real-world reading, so they are asserted directly here. The scoring maths itself is
// covered by tests/metricChecks.property.test.ts; here we prove the right numbers reach it.
import { describe, expect, it } from 'vitest';
import {
  faceFrameFromResult,
  armFrameFromResult,
  type FaceResultLike,
  type PoseResultLike,
  type NormLandmark,
} from '#lib/vision/mapFrames.ts';
import { faceAsymmetry } from '#lib/metrics/faceAsymmetry.ts';
import { armDrift } from '#lib/metrics/armDrift.ts';

const W = 640;
const H = 480;

/** A full normalized-landmark array where only the given indices are set (rest are at origin). */
function landmarks(set: Record<number, NormLandmark>, length = 300): NormLandmark[] {
  const arr: NormLandmark[] = Array.from({ length }, () => ({ x: 0, y: 0 }));
  for (const [i, l] of Object.entries(set)) arr[Number(i)] = l;
  return arr;
}

const FLAT_BLENDSHAPES = {
  categories: [
    'mouthSmileLeft',
    'mouthSmileRight',
    'mouthFrownLeft',
    'mouthFrownRight',
    'eyeBlinkLeft',
    'eyeBlinkRight',
    'browDownLeft',
    'browDownRight',
  ].map((categoryName) => ({ categoryName, score: 0 })),
};

describe('faceFrameFromResult', () => {
  it('returns null when no face is detected', () => {
    expect(faceFrameFromResult({ faceLandmarks: [], faceBlendshapes: [] }, W, H)).toBeNull();
  });

  it('maps indices 33/263/61/291 to the right fields and converts to pixels', () => {
    const res: FaceResultLike = {
      faceLandmarks: [
        landmarks({
          33: { x: 0.4, y: 0.5 }, // left eye
          263: { x: 0.6, y: 0.5 }, // right eye
          61: { x: 0.45, y: 0.7 }, // left mouth corner
          291: { x: 0.55, y: 0.7 }, // right mouth corner
        }),
      ],
      faceBlendshapes: [FLAT_BLENDSHAPES],
    };
    const f = faceFrameFromResult(res, W, H)!;
    expect(f.eye33).toEqual({ x: 0.4 * W, y: 0.5 * H });
    expect(f.eye263).toEqual({ x: 0.6 * W, y: 0.5 * H });
    expect(f.mouth61).toEqual({ x: 0.45 * W, y: 0.7 * H });
    expect(f.mouth291).toEqual({ x: 0.55 * W, y: 0.7 * H });
    expect(Object.keys(f.blendshapes).sort()).toHaveLength(8);
  });

  it('a symmetric face scores ~0', () => {
    const res: FaceResultLike = {
      faceLandmarks: [
        landmarks({
          33: { x: 0.4, y: 0.5 },
          263: { x: 0.6, y: 0.5 },
          61: { x: 0.45, y: 0.7 },
          291: { x: 0.55, y: 0.7 }, // same height = no droop
        }),
      ],
      faceBlendshapes: [FLAT_BLENDSHAPES],
    };
    const frames = Array.from({ length: 40 }, () => faceFrameFromResult(res, W, H));
    const result = faceAsymmetry(frames, { mirrored: false });
    expect(result.status).toBe('ok');
    expect(result.score!).toBeCloseTo(0, 5);
  });

  it('a one-sided mouth droop produces a non-zero score on a definite side', () => {
    const res: FaceResultLike = {
      faceLandmarks: [
        landmarks({
          33: { x: 0.4, y: 0.5 },
          263: { x: 0.6, y: 0.5 },
          61: { x: 0.45, y: 0.78 }, // left corner lower (droops)
          291: { x: 0.55, y: 0.7 },
        }),
      ],
      faceBlendshapes: [FLAT_BLENDSHAPES],
    };
    const frames = Array.from({ length: 40 }, () => faceFrameFromResult(res, W, H));
    const result = faceAsymmetry(frames, { mirrored: false });
    expect(result.status).toBe('ok');
    expect(result.score!).toBeGreaterThan(0);
    expect(result.side === 'left' || result.side === 'right').toBe(true);
  });
});

describe('armFrameFromResult', () => {
  it('returns null when no pose is detected', () => {
    expect(armFrameFromResult({ landmarks: [] }, W, H)).toBeNull();
  });

  it('maps indices 11/12/15/16 to the right fields, converts to pixels, keeps visibility', () => {
    const res: PoseResultLike = {
      landmarks: [
        landmarks({
          11: { x: 0.6, y: 0.4, visibility: 0.9 }, // left shoulder (image-right)
          12: { x: 0.4, y: 0.4, visibility: 0.9 }, // right shoulder (image-left)
          15: { x: 0.65, y: 0.6, visibility: 0.9 }, // left wrist
          16: { x: 0.35, y: 0.6, visibility: 0.9 }, // right wrist
        }),
      ],
    };
    const f = armFrameFromResult(res, W, H)!;
    expect(f.shoulder11).toEqual({ x: 0.6 * W, y: 0.4 * H, visibility: 0.9 });
    expect(f.shoulder12).toEqual({ x: 0.4 * W, y: 0.4 * H, visibility: 0.9 });
    expect(f.wrist15).toEqual({ x: 0.65 * W, y: 0.6 * H, visibility: 0.9 });
    expect(f.wrist16).toEqual({ x: 0.35 * W, y: 0.6 * H, visibility: 0.9 });
  });

  it('a wrist that drops over time produces arm drift on a definite side', () => {
    // 80 frames: image-left wrist (16) sinks from y=0.6 to y=0.9; the other stays.
    const frames = Array.from({ length: 80 }, (_, i) => {
      const drop = 0.6 + (0.3 * i) / 79;
      const res: PoseResultLike = {
        landmarks: [
          landmarks({
            11: { x: 0.6, y: 0.4, visibility: 0.9 },
            12: { x: 0.4, y: 0.4, visibility: 0.9 },
            15: { x: 0.65, y: 0.6, visibility: 0.9 }, // steady
            16: { x: 0.35, y: drop, visibility: 0.9 }, // sinking
          }),
        ],
      };
      return armFrameFromResult(res, W, H);
    });
    const result = armDrift(frames, { mirrored: false });
    expect(result.status).toBe('ok');
    expect(result.score!).toBeGreaterThan(0);
    expect(result.side === 'left' || result.side === 'right').toBe(true);
  });

  it('a landmark below the visibility gate is dropped (metric sees it as missing)', () => {
    const res: PoseResultLike = {
      landmarks: [
        landmarks({
          11: { x: 0.6, y: 0.4, visibility: 0.9 },
          12: { x: 0.4, y: 0.4, visibility: 0.9 },
          15: { x: 0.65, y: 0.6, visibility: 0.1 }, // too low
          16: { x: 0.35, y: 0.6, visibility: 0.9 },
        }),
      ],
    };
    const frames = Array.from({ length: 80 }, () => armFrameFromResult(res, W, H));
    // Every frame has an unusable wrist, so no frame counts: poor_quality, never a false 'ok'.
    expect(armDrift(frames, { mirrored: false }).status).toBe('poor_quality');
  });
});
