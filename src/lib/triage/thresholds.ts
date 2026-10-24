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
} as const;
