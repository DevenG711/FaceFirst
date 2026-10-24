# Requirements: Metrics

## Introduction

`src/lib/metrics/` turns plain landmark, blendshape, transcript and amplitude data into `CheckResult`s for the triage engine. Every module is a pure TypeScript function (no DOM, no MediaPipe, no Svelte), so it can be property-tested. Metrics only measure: they never decide what is flagged. That is the engine's job (`.kiro/specs/triage-engine/`).

Requirements tagged **[PBT]** are covered by fast-check properties in `tests/metrics.property.test.ts` (geometry) or `tests/metricChecks.property.test.ts` (checks).

## Glossary

- **Side A / side B**: image-left / image-right of the frame given to MediaPipe. Face A = landmarks 33 / 61, B = 263 / 291. Pose A = 12 / 16, B = 11 / 15.
- **Mirrored**: the frame given to MediaPipe was horizontally flipped. CSS-only mirroring of the preview is not mirrored.
- **Usable frame**: a frame whose required points are present, finite, non-degenerate and (pose) visible enough.

## Requirement 1: Normalization (`geometry.ts`)

1. THE SYSTEM SHALL express face points in inter-ocular units with the eye line horizontal, and pose points in shoulder-width units with the shoulder line horizontal and y pointing down. **[PBT]**
2. THE SYSTEM SHALL produce the same normalized values when every input point is uniformly scaled, rotated and translated. **[PBT]**
3. WHEN the two reference points coincide or are non-finite THE SYSTEM SHALL reject the frame instead of dividing by zero. **[PBT]**
4. THE SYSTEM SHALL map image sides to anatomical sides in `geometry.ts` only. For a fixed mode the mapping SHALL be an involution, and flipping `mirrored` SHALL flip the result. **[PBT]**
5. THE SYSTEM SHALL let per-frame callers reuse output buffers so hot loops do not allocate.

## Requirement 2: Face asymmetry (`faceAsymmetry.ts`)

1. THE SYSTEM SHALL return a score >= 0 when status is `ok`, and `score: null, side: null` otherwise. **[PBT]**
2. THE SYSTEM SHALL be invariant to translation, scale and roll of the face. **[PBT]**
3. WHEN the face is perfectly symmetric THE SYSTEM SHALL score approximately 0. **[PBT]**
4. WHEN the mouth corner on the weaker (or tied) side is lowered in any subset of frames THE SYSTEM SHALL NOT return a lower score. **[PBT]**
5. WHEN the anatomical left corner droops THE SYSTEM SHALL report `side: 'left'` in both mirrored modes. **[PBT]**
6. WHEN fewer than `QUALITY.MIN_FACE_FRAMES` frames are usable THE SYSTEM SHALL return `poor_quality`. Frames with no face, missing blendshapes or a degenerate eye line SHALL be skipped. **[PBT]**

## Requirement 3: Arm drift (`armDrift.ts`)

1. THE SYSTEM SHALL return a score >= 0 when status is `ok`, and `score: null, side: null` otherwise. **[PBT]**
2. THE SYSTEM SHALL be invariant to scale, translation and roll. **[PBT]**
3. WHEN both arms drift equally THE SYSTEM SHALL score approximately 0. **[PBT]**
4. WHEN the arm that already drifts more (or ties) drifts further THE SYSTEM SHALL NOT return a lower score. **[PBT]**
5. WHEN the anatomical left arm drifts THE SYSTEM SHALL report `side: 'left'` in both mirrored modes. **[PBT]**
6. WHEN a wrist is missing or below `QUALITY.MIN_LANDMARK_VISIBILITY`, or fewer than `QUALITY.MIN_ARM_FRAMES` frames are usable, THE SYSTEM SHALL return `poor_quality`. **[PBT]**
7. THE SYSTEM SHALL NOT count an arm rising as drift.

## Requirement 4: Speech (`speech.ts`)

1. WHEN the transcript equals the target THE SYSTEM SHALL score 0. **[PBT]**
2. THE SYSTEM SHALL ignore case, punctuation and accents. **[PBT]**
3. THE SYSTEM SHALL return a score in [0, 1]. **[PBT]**
4. WHEN a word is dropped from the transcript THE SYSTEM SHALL NOT return a lower score. **[PBT]**
5. WHEN the transcript has no words THE SYSTEM SHALL return `poor_quality`; WHEN there is no transcript THE SYSTEM SHALL return `unavailable`. **[PBT]**
6. WHEN a speaking duration below `QUALITY.MIN_SPEECH_MS` is supplied THE SYSTEM SHALL return `poor_quality`.
7. THE SYSTEM SHALL report speaking duration and pause count as non-negative values, counting only pauses of at least `QUALITY.MIN_PAUSE_MS` between speech. **[PBT]**

## Requirement 5: Thresholds and integration

1. THE SYSTEM SHALL read every quality gate, weight and window from `src/lib/triage/thresholds.ts`, each marked as an uncalibrated placeholder.
2. FOR each check, a clearly abnormal input SHALL produce `CALL_911_NOW` through `triage()` with the correct anatomical side.
