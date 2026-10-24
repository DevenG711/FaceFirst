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

  // Articulation rate: target words per second of voiced (non-silent) time. Slow = suspicious.
  MIN_WORDS_PER_SEC: 2.0, // at or above this, the rate sub-score is 0. Uncalibrated placeholder.
  SLOW_WORDS_PER_SEC: 1.0, // at or below this, the rate sub-score is 1. Uncalibrated placeholder.

  // Pauses: share of the speech span (first to last voiced sample) spent in pauses of at least
  // QUALITY.MIN_PAUSE_MS, and the longest single hesitation. Many or long pauses = suspicious.
  MAX_PAUSE_RATIO: 0.3, // at or below this pause share, the pause sub-score is 0. Uncalibrated placeholder.
  HIGH_PAUSE_RATIO: 0.6, // at or above this pause share, the pause sub-score is 1. Uncalibrated placeholder.
  LONG_PAUSE_MS: 1000, // a single hesitation this long starts to count. Uncalibrated placeholder.
  VERY_LONG_PAUSE_MS: 2500, // a single hesitation this long gives a pause sub-score of 1. Uncalibrated placeholder.

  // Envelope modulation: coefficient of variation (std / mean) of voiced amplitudes. Flat, under-
  // modulated ("mushy") speech has a low value. Scale-free, so microphone gain does not matter.
  MIN_ENVELOPE_CV: 0.4, // at or above this, the envelope sub-score is 0. Uncalibrated placeholder.
  FLAT_ENVELOPE_CV: 0.15, // at or below this, the envelope sub-score is 1. Uncalibrated placeholder.

  // Weights that average the three sub-scores into one acoustic score in [0, 1].
  WEIGHT_RATE: 0.4, // Uncalibrated placeholder.
  WEIGHT_PAUSE: 0.3, // Uncalibrated placeholder.
  WEIGHT_ENVELOPE: 0.3, // Uncalibrated placeholder.

  /** Final speech score = min(1, word error + ACOUSTIC_WEIGHT × acoustic score). Uncalibrated placeholder. */
  ACOUSTIC_WEIGHT: 0.5,
} as const;
