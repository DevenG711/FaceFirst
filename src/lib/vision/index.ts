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
import {
  faceAsymmetry,
  pickBlendshapes,
  type FaceFrameInput,
} from '#lib/metrics/faceAsymmetry.ts';
import { armDrift, type ArmFrameInput } from '#lib/metrics/armDrift.ts';
import type { CheckResult } from '#lib/triage/types.ts';

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

/** Pixel-coordinate converter for one landmark. */
const toPx = (l: { x: number; y: number }, w: number, h: number) => ({ x: l.x * w, y: l.y * h });

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
        const lm = res.faceLandmarks[0];
        frames.push(
          lm
            ? {
                eye33: toPx(lm[33]!, W, H),
                eye263: toPx(lm[263]!, W, H),
                mouth61: toPx(lm[61]!, W, H),
                mouth291: toPx(lm[291]!, W, H),
                blendshapes: pickBlendshapes(res.faceBlendshapes[0]?.categories ?? []),
              }
            : null
        );
      });
      return faceAsymmetry(frames, { mirrored: false });
    }

    const landmarker = await poseLandmarker();
    const frames: (ArmFrameInput | null)[] = [];
    await collect(video, signal, (nowMs) => {
      const res: PoseLandmarkerResult = landmarker.detectForVideo(video, nowMs);
      const p = res.landmarks[0];
      const pv = (l: { x: number; y: number; visibility?: number } | undefined) =>
        l ? { ...toPx(l, W, H), visibility: l.visibility } : null;
      frames.push(
        p
          ? {
              shoulder11: pv(p[11]),
              shoulder12: pv(p[12]),
              wrist15: pv(p[15]),
              wrist16: pv(p[16]),
            }
          : null
      );
    });
    return armDrift(frames, { mirrored: false });
  } catch {
    return onUnavailable();
  }
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
