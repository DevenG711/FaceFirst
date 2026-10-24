// Small constructors so every metric builds CheckResults the same way (score only when ok).
import type { CheckId, CheckResult, Side } from '../triage/types.ts';

export const okResult = (id: CheckId, score: number, side: Side | null): CheckResult => ({
  id,
  status: 'ok',
  score,
  side,
});

/** The capture ran but was not good enough to score. The engine turns this into RETRY_CAPTURE. */
export const poorQuality = (id: CheckId): CheckResult => ({ id, status: 'poor_quality', score: null, side: null });

/** The check could not run at all (skipped, unsupported browser). */
export const unavailable = (id: CheckId): CheckResult => ({ id, status: 'unavailable', score: null, side: null });

/** Median of a non-empty array. Sorts a copy; call once per check, not per frame. */
export function median(values: readonly number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}
