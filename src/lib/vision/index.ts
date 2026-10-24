// Vision layer: the ONLY place MediaPipe touches the app. It owns the FaceLandmarker and
// PoseLandmarker, runs them over the live <video> during a capture, and hands the pure metrics
// (lib/metrics) plain pixel-coordinate frames. Nothing here leaves the device: the WASM runtime
// is served from our own origin (static/mediapipe/wasm) and the models are fetched once and run
// in the browser (.kiro/steering/safety.md §4).
//
// Mirroring: the preview is flipped with CSS only; the pixels we pass to MediaPipe are NOT flipped,
// so every metric is called with { mirrored: false } and sides come back anatomical.
import {
  FilesetResolver,
  FaceLandmarker,
  PoseLandmarker,
  type FaceLandmarkerResult,
  type PoseLandmarkerResult,
} from '@mediapipe/tasks-vision';
import { faceAsymmetry, faceFit, type FaceFit, type FaceFrameInput } from '#lib/metrics/faceAsymmetry.ts';
import { armDrift, armFit, type ArmFit, type ArmFrameInput } from '#lib/metrics/armDrift.ts';
import { QUALITY } from '#lib/triage/thresholds.ts';
import type { CheckResult } from '#lib/triage/types.ts';
import { armFrameFromResult, faceFrameFromResult } from './mapFrames.ts';

/** WASM runtime, vendored into static/ so it loads from our own origin. */
const WASM_PATH = '/mediapipe/wasm';

/**
 * Models. Fetched from Google's public model store on first use and then cached by the browser.
 * If this fetch fails (offline, blocked), the check records `unavailable`, which the triage engine
 * treats as "could not measure" — it can only make the result MORE cautious, never less.
 */
const FACE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

let facePromise: Promise<FaceLandmarker> | null = null;
let posePromise: Promise<PoseLandmarker> | null = null;

async function faceLandmarker(): Promise<FaceLandmarker> {
  if (!facePromise) {
    facePromise = FilesetResolver.forVisionTasks(WASM_PATH).then((fileset) =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: FACE_MODEL },
        runningMode: 'VIDEO',
        numFaces: 1,
        outputFaceBlendshapes: true,
      })
    );
  }
  return facePromise;
}

async function poseLandmarker(): Promise<PoseLandmarker> {
  if (!posePromise) {
    posePromise = FilesetResolver.forVisionTasks(WASM_PATH).then((fileset) =>
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL },
        runningMode: 'VIDEO',
        numPoses: 1,
      })
    );
  }
  return posePromise;
}

/**
 * Runs `kind` detection over `video` until `signal` aborts, collecting one metric frame per
 * animation tick, then returns the metric's CheckResult. On any failure (model load, detection)
 * it resolves to a caller-supplied `unavailable` result rather than throwing — the flow must never
 * break on a camera/model problem.
 */
export async function runCameraCheck(
  kind: 'face' | 'arm',
  video: HTMLVideoElement,
  signal: AbortSignal,
  onUnavailable: () => CheckResult
): Promise<CheckResult> {
  try {
    const W = video.videoWidth;
    const H = video.videoHeight;
    if (!W || !H) return onUnavailable();

    if (kind === 'face') {
      const landmarker = await faceLandmarker();
      const frames: (FaceFrameInput | null)[] = [];
      await collect(video, signal, (nowMs) => {
        const res: FaceLandmarkerResult = landmarker.detectForVideo(video, nowMs);
        frames.push(faceFrameFromResult(res, W, H));
      });
      return faceAsymmetry(frames, { mirrored: false });
    }

    const landmarker = await poseLandmarker();
    const frames: (ArmFrameInput | null)[] = [];
    await collect(video, signal, (nowMs) => {
      const res: PoseLandmarkerResult = landmarker.detectForVideo(video, nowMs);
      frames.push(armFrameFromResult(res, W, H));
    });
    return armDrift(frames, { mirrored: false });
  } catch {
    return onUnavailable();
  }
}

/** What the person still needs to do before a capture starts (the i18n key suffix under check.coach.<kind>). */
export type FitHint = Exclude<ArmFit, 'ok'> | Exclude<FaceFit, 'ok'>;

/**
 * Pre-capture gate. Runs detection until enough CONSECUTIVE frames are ready, reporting the current
 * problem through `onHint` (only when it changes):
 * - arm: both shoulders and both wrists in view for QUALITY.ARM_FIT_FRAMES frames.
 * - face: smiling (stronger side) for QUALITY.FACE_SMILE_FRAMES frames. After QUALITY.FACE_SMILE_WAIT_MS
 *   it gives up waiting and resolves `timeout`, so a person who cannot smile is still measured.
 * Resolves `fit`, `timeout`, `aborted` (user skipped / left), or `error` (model failed to load; the
 * caller records `unavailable`).
 */
export async function waitForFit(
  kind: 'face' | 'arm',
  video: HTMLVideoElement,
  signal: AbortSignal,
  onHint: (hint: FitHint) => void
): Promise<'fit' | 'timeout' | 'aborted' | 'error'> {
  const W = video.videoWidth;
  const H = video.videoHeight;
  if (!W || !H) return 'error';
  let check: (nowMs: number) => FitHint | 'ok';
  try {
    if (kind === 'face') {
      const landmarker = await faceLandmarker();
      check = (nowMs) => faceFit(faceFrameFromResult(landmarker.detectForVideo(video, nowMs), W, H));
    } else {
      const landmarker = await poseLandmarker();
      check = (nowMs) => armFit(armFrameFromResult(landmarker.detectForVideo(video, nowMs), W, H));
    }
  } catch {
    return 'error';
  }
  if (signal.aborted) return 'aborted';

  const needed = kind === 'face' ? QUALITY.FACE_SMILE_FRAMES : QUALITY.ARM_FIT_FRAMES;
  // Inner controller so we can stop the loop ourselves once ready, without touching the caller's.
  const done = new AbortController();
  const forward = () => done.abort();
  signal.addEventListener('abort', forward, { once: true });
  let timedOut = false;
  const timeout =
    kind === 'face'
      ? setTimeout(() => {
          timedOut = true;
          done.abort();
        }, QUALITY.FACE_SMILE_WAIT_MS)
      : undefined;
  let streak = 0;
  let last: FitHint | 'ok' | null = null;
  await collect(video, done.signal, (nowMs) => {
    const fit = check(nowMs);
    streak = fit === 'ok' ? streak + 1 : 0;
    if (fit !== 'ok' && fit !== last) onHint(fit);
    last = fit;
    if (streak >= needed) done.abort();
  });
  clearTimeout(timeout);
  signal.removeEventListener('abort', forward);
  if (signal.aborted) return 'aborted';
  return timedOut ? 'timeout' : 'fit';
}

/** Calls `tick(nowMs)` once per animation frame until `signal` aborts. */
function collect(
  video: HTMLVideoElement,
  signal: AbortSignal,
  tick: (nowMs: number) => void
): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    let raf = 0;
    let lastVideoTime = -1;
    const loop = () => {
      if (signal.aborted) {
        cancelAnimationFrame(raf);
        return resolve();
      }
      // MediaPipe VIDEO mode wants a strictly increasing timestamp; skip duplicate frames.
      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        try {
          tick(performance.now());
        } catch {
          // One bad frame must not kill the capture; the metric handles sparse frames.
        }
      }
      raf = requestAnimationFrame(loop);
    };
    const onAbort = () => {
      cancelAnimationFrame(raf);
      resolve();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    raf = requestAnimationFrame(loop);
  });
}
