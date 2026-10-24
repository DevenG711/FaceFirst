/**
 * ============================================================================
 *  UNCALIBRATED RESEARCH PLACEHOLDERS. NOT CLINICALLY VALIDATED.
 *  Do not use for diagnosis. Every value below is a guess chosen for a demo,
 *  not derived from clinical data. Commercial use would require clinical
 *  validation and FDA review. See .kiro/steering/safety.md §5.
 *
 *  This is the only file allowed to contain numeric thresholds.
 * ============================================================================
 */
import type { CheckId } from './types.ts';

/** Score above which a check is flagged with no baseline. UNCALIBRATED placeholders. */
export const POPULATION_THRESHOLD: Readonly<Record<CheckId, number>> = {
  face: 0.12, // normalized mouth-corner asymmetry (inter-ocular units). Uncalibrated placeholder.
  arm: 0.15, // normalized wrist drift difference (shoulder-width units). Uncalibrated placeholder.
  speech: 0.3, // 1 − word accuracy. Uncalibrated placeholder.
};

/** Score rise over the person's own baseline that flags a check. UNCALIBRATED placeholders. */
export const BASELINE_DEVIATION_THRESHOLD: Readonly<Record<CheckId, number>> = {
  face: 0.05, // inter-ocular units above baseline. Uncalibrated placeholder.
  arm: 0.08, // shoulder-width units above baseline. Uncalibrated placeholder.
  speech: 0.2, // word-error rate above baseline. Uncalibrated placeholder.
};

/** Capture-quality gates used by lib/metrics. Below these a check is `poor_quality`. UNCALIBRATED placeholders. */
export const QUALITY = {
  MIN_FACE_FRAMES: 30, // tracked face frames (~1.5 s at 20 fps). Uncalibrated placeholder.
  MIN_ARM_FRAMES: 60, // frames with both wrists visible (~3 s at 20 fps). Uncalibrated placeholder.
  MIN_SPEECH_MS: 1000, // minimum speaking duration in ms. Uncalibrated placeholder.
  SILENCE_LEVEL: 0.02, // RMS amplitude (0–1) at or below which audio counts as silence. Uncalibrated placeholder.
  MIN_PAUSE_MS: 250, // silence shorter than this is not counted as a pause. Uncalibrated placeholder.
  MIN_LANDMARK_VISIBILITY: 0.5, // pose landmark visibility (0–1) below which a point is treated as missing. Uncalibrated placeholder.
  /**
   * Face-direction agreement gate. A real one-sided droop makes most per-frame readings lean the SAME
   * way; a capture where the subject turned, talked, or was poorly tracked splits them, so the median
   * can land near zero and hide a problem. When the signed readings agree on direction LESS than this
   * fraction AND the score sits below FACE_AMBIGUOUS_MAX, the capture is ambiguous → poor_quality
   * (retry), never a false low reading. A clear droop (score ≥ FACE_AMBIGUOUS_MAX) always passes
   * through so a real escalation is never suppressed. Uncalibrated placeholder.
   */
  MIN_FACE_SIGN_AGREEMENT: 0.6, // 0.5 = a coin-flip split. Uncalibrated placeholder.
  FACE_AMBIGUOUS_MAX: 0.08, // inter-ocular units; below the 0.12 flag threshold. Uncalibrated placeholder.
  /**
   * Noise floor for the direction-agreement gate. A per-frame signed reading only counts as "leaning"
   * toward a side when its magnitude exceeds this; anything smaller is floating-point dust or a
   * practically-symmetric frame and casts no vote. Without it, a symmetric face whose residuals are
   * ±1e-14 would split sign and trip the gate. Uncalibrated placeholder.
   */
  FACE_LEAN_EPSILON: 1e-6, // inter-ocular units. Uncalibrated placeholder.
  /**
   * Arm-drift agreement gate. The drift difference is only trustworthy if enough valid frames span the
   * whole hold. Below this fraction of frames usable across the capture, drift is noise → poor_quality.
   * Uncalibrated placeholder.
   */
  MIN_ARM_FRAME_SPAN: 0.5, // fraction of the clip's frames that must be usable. Uncalibrated placeholder.
  /**
   * Arm "fit" gate before the hold timer starts: this many CONSECUTIVE frames must show both shoulders
   * and both wrists (the same test armDrift uses to count a frame) before we say "Good, hold still".
   * Consecutive so a single lucky frame does not start the timer. Uncalibrated placeholder.
   */
  ARM_FIT_FRAMES: 10, // ~0.5 s at 20 fps. Uncalibrated placeholder.
  /**
   * Face "start when smiling" gate. The capture starts once the STRONGER side's mouthSmile blendshape
   * reaches FACE_SMILE_START for FACE_SMILE_FRAMES consecutive frames. If that never happens within
   * FACE_SMILE_WAIT_MS (the person cannot smile or cannot follow the prompt, both possible stroke
   * signs), the capture starts anyway so the gate can never stall the check. Uncalibrated placeholders.
   */
  FACE_SMILE_START: 0.4, // mouthSmile blendshape (0–1). Uncalibrated placeholder.
  FACE_SMILE_FRAMES: 5, // ~0.25 s at 20 fps. Uncalibrated placeholder.
  FACE_SMILE_WAIT_MS: 8000, // ms. Uncalibrated placeholder.
} as const;

/** Weights and windows used to turn raw measurements into scores in lib/metrics. UNCALIBRATED placeholders. */
export const METRIC_PARAMS = {
  /**
   * Blendshape (0–1) asymmetry is added to mouth-corner droop (inter-ocular units) with these weights.
   * Uncalibrated placeholders.
   */
  FACE_WEIGHT_SMILE: 0.15, // weaker smile on one side. Uncalibrated placeholder.
  FACE_WEIGHT_FROWN: 0.05, // more frown (corner pulled down) on one side. Uncalibrated placeholder.
  FACE_WEIGHT_BLINK: 0.05, // weaker eye closure on one side. Uncalibrated placeholder.
  FACE_WEIGHT_BROW: 0.05, // lower brow on one side. Uncalibrated placeholder.
  /** Fraction of valid arm frames at the start / end that are compared to measure drift. Uncalibrated placeholder. */
  ARM_WINDOW_FRACTION: 0.25,
} as const;

/**
 * Acoustic PROXIES for slurred or effortful speech (dysarthria), read from the RMS amplitude envelope.
 * These are crude, uncalibrated signals, NOT a validated slur detector. They can only ever raise the
 * speech score (escalate-only). Each sub-score is 0 at its "ok" bound and 1 at its "bad" bound.
 * UNCALIBRATED placeholders.
 */
export const ACOUSTIC_PARAMS = {
  SAMPLE_MS: 50, // how often the speech route samples RMS amplitude, in ms. Uncalibrated placeholder.

  // A sample counts as voiced only above this fraction of the attempt's loudest sample (and above
  // QUALITY.SILENCE_LEVEL), so room hum or a hot mic is not mistaken for speech, which would make
  // fluent speech look slow and hide real pauses. Uncalibrated placeholder.
  RELATIVE_SILENCE: 0.15,

  // Speaking rate: target words per second over the speech span (first to last voiced sample). The
  // span's ends are easy to find, so this is far steadier run to run than voiced-time-only articulation
  // rate, which flips with every syllable near the voiced floor. One fluent read: 4.35; one deliberately
  // slurred read: 0.49 (single-tester check, not calibration). Slow = suspicious.
  MIN_WORDS_PER_SEC: 2.0, // at or above this, the rate sub-score is 0. Uncalibrated placeholder.
  SLOW_WORDS_PER_SEC: 1.0, // at or below this, the rate sub-score is 1. Uncalibrated placeholder.

  // Pauses: share of the speech span (first to last voiced sample) spent in pauses of at least
  // QUALITY.MIN_PAUSE_MS, and the longest single hesitation. Many or long pauses = suspicious.
  // 0.35 leaves room for natural pauses: one fluent read measured 0.24 (single-tester check, not calibration).
  MAX_PAUSE_RATIO: 0.35, // at or below this pause share, the pause sub-score is 0. Uncalibrated placeholder.
  HIGH_PAUSE_RATIO: 0.6, // at or above this pause share, the pause sub-score is 1. Uncalibrated placeholder.
  LONG_PAUSE_MS: 1000, // a single hesitation this long starts to count. Uncalibrated placeholder.
  VERY_LONG_PAUSE_MS: 2500, // a single hesitation this long gives a pause sub-score of 1. Uncalibrated placeholder.

  // Envelope modulation: coefficient of variation (std / mean) of voiced amplitudes. Flat, under-
  // modulated ("mushy") speech has a low value. Scale-free, so microphone gain does not matter.
  // In single-tester checks fluent (0.54–1.03) and slurred (0.47–0.78) reads overlapped, so this
  // proxy is set to catch only clearly flat speech and is weighted lowest, to keep run-to-run noise down.
  MIN_ENVELOPE_CV: 0.3, // at or above this, the envelope sub-score is 0. Uncalibrated placeholder.
  FLAT_ENVELOPE_CV: 0.1, // at or below this, the envelope sub-score is 1. Uncalibrated placeholder.

  // Weights that average the three sub-scores into one acoustic score in [0, 1].
  WEIGHT_RATE: 0.5, // steadiest proxy, weighted highest. Uncalibrated placeholder.
  WEIGHT_PAUSE: 0.3, // Uncalibrated placeholder.
  WEIGHT_ENVELOPE: 0.2, // noisiest proxy, weighted lowest. Uncalibrated placeholder.

  /**
   * Final speech score = min(1, word error + ACOUSTIC_WEIGHT × acoustic score). At 0.7, acoustics alone
   * flag (> POPULATION_THRESHOLD.speech) once the acoustic score passes ~0.43, i.e. at least two strong
   * proxies together. One deliberately slow, over-paused read scored 0.55; a fluent read scored 0
   * (single-tester check, not calibration). Uncalibrated placeholder.
   */
  ACOUSTIC_WEIGHT: 0.7,
} as const;

/**
 * How long the speech check keeps listening. Generous on purpose: slurred or effortful speech can be
 * slow, with long gaps between words, and must not be cut off as "silence" (those gaps are what the
 * pause proxy measures). UNCALIBRATED placeholders.
 */
export const LISTEN_PARAMS = {
  START_TIMEOUT_MS: 10000, // stop if nothing at all is heard for this long after tapping. Uncalibrated placeholder.
  END_SILENCE_MS: 4000, // once speech has started, stop only after this much continuous silence. Uncalibrated placeholder.
  MAX_LISTEN_MS: 30000, // hard cap per attempt. Uncalibrated placeholder.
} as const;
