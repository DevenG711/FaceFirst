# Design: Metrics

## Overview

```mermaid
flowchart LR
  V[lib/vision: MediaPipe results] -->|pixel points + blendshapes| F[faceAsymmetry]
  V -->|pixel pose points| A[armDrift]
  W[Web Speech + AnalyserNode] -->|transcript, RMS samples| S[speechScore / speechTiming]
  F & A & S --> C[CheckResult] --> T[triage()] --> K[resultCopy()]
```

Metrics are batch functions: the route collects frames during the capture and calls the metric once at the end. Every number comes from `thresholds.ts` (`QUALITY`, `METRIC_PARAMS`).

## Input contracts (for partner2's `lib/vision` and routes)

All points are PIXEL coordinates: `landmark.x * video.videoWidth`, `landmark.y * video.videoHeight`. Raw 0–1 landmarks distort distances on non-square frames. Pass `null` for a frame (or pose landmark) that was not detected; it is skipped.

```ts
// faceAsymmetry.ts
interface FaceFrameInput {
  eye33: Point; eye263: Point; mouth61: Point; mouth291: Point;
  blendshapes: Partial<Record<FaceBlendshape, number>>; // use pickBlendshapes(result.faceBlendshapes[0].categories)
}
faceAsymmetry(frames: (FaceFrameInput | null)[], { mirrored }): CheckResult

// armDrift.ts
interface PoseLandmark extends Point { visibility?: number }
interface ArmFrameInput { shoulder11; shoulder12; wrist15; wrist16: PoseLandmark | null }
armDrift(frames: (ArmFrameInput | null)[], { mirrored }): CheckResult

// speech.ts
speechTiming(rmsSamples: ArrayLike<number>, sampleMs: number): { speakingMs, pauseCount }
speechScore(transcript: string | null | undefined, target: string, { speakingMs? }): CheckResult
```

`mirrored` means the image passed to `detectForVideo` was flipped. If the preview is mirrored with CSS and the raw `<video>` is passed to MediaPipe, use `mirrored: false`.

## How the metrics work

### Geometry (`geometry.ts`)

A frame is built from two reference points A → B: origin = midpoint, angle = roll of A → B, scale = |AB|. `normalizePoint` translates, rotates by −angle and divides by scale, so A = (−0.5, 0) and B = (0.5, 0). Face uses 33 → 263. Pose uses 12 → 11 (image-left → image-right), so y stays pointing down for an upright person. `normalizePoint(s)` write into caller buffers.

Side mapping: MediaPipe labels landmarks as the person appears, so for an upright person side A (33, 61, 12, 16) is image-left. `toAnatomical(imageSide, mirrored)`: raw camera → image-left is the person's right; mirrored → image-left is their left. `anatomicalSideOfA/B` wrap this. `BLENDSHAPE_LEFT_IS_SIDE` records which side the blendshape suffix "Left" refers to (assumed B; verify live).

### Face

Per usable frame, a signed asymmetry (positive = side A weaker):

```
droop  = y(61) − y(291)                          // normalized, y down
signed = droop − w_smile·(smileA − smileB) + w_frown·(frownA − frownB)
               − w_blink·(blinkA − blinkB) + w_brow·(browDownA − browDownB)
score  = |median(signed)|,  side = A if median > 0, B if < 0, null if 0 (then mapped anatomically)
```

The median ignores a minority of bad frames (blinks, glitches). Blendshape terms are invariant to geometry by construction.

### Arm

Per usable frame (both shoulders and both wrists visible), wrist y in the shoulder frame. With `k = max(1, min(⌊n · ARM_WINDOW_FRACTION⌋, ⌊n/2⌋))`:

```
drift(arm) = max(0, median(last k) − median(first k))   // drop only; rising is not drift
score = |drift(A) − drift(B)|,  side = the arm that dropped more
```

Non-overlapping windows guarantee that a wrist that keeps sinking can only raise its drift (Req 3.4).

Known limitation: an arm that drops out of the frame makes its wrist invisible, which gives `poor_quality` → `RETRY_CAPTURE`, not `CALL_911_NOW`. The caregiver "arm weak" button covers this.

### Speech

`words()` NFD-normalizes, strips combining marks, lowercases, replaces punctuation with spaces and splits. `score = 1 − LCS(transcript, target) / |target|`. LCS (not WER) is used so extra words are not penalized, which makes "dropping a word never lowers the score" true.

`speechTiming` counts samples above `SILENCE_LEVEL` as speech, and counts a pause when speech resumes after a silent run of at least `MIN_PAUSE_MS`. Leading and trailing silence are not pauses.

## Deviations from the plan

- "Lowering one mouth corner never lowers the score" and "more drift on one arm never lowers the score" are false as written: changing the stronger side makes the person more symmetric. The properties are stated for the weaker (or tied) side.
- "`toAnatomical` applied twice with flipped `mirrored` returns the original side" is false (it returns the opposite). Split into involution + flip properties.

## Testing strategy

- `tests/metrics.property.test.ts`: geometry (derotation, similarity invariance, degenerate frames, buffer reuse, side mapping, pose frame orientation).
- `tests/metricChecks.property.test.ts`: face, arm and speech properties, plus one `triage()` integration test per check. Canonical faces/holds are generated and then placed in the image with a random similarity transform. Arm heights use integer-based generators, because `fc.double` biases toward ~0 and produced flat holds that made the arm properties vacuous (found by mutation testing).
