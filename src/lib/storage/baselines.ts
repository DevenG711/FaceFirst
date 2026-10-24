// Personal baseline: the person's own usual face (and arm) asymmetry, recorded on a typical day and
// used later so a check can compare them against themselves (product.md, differentiator 2).
//
// Privacy (safety.md §4): only a few NUMBERS are stored, locally, in IndexedDB. No video, image or
// landmark data is kept or sent anywhere.
//
// Safety: a baseline can only ADD sensitivity. The triage engine still applies the population
// threshold first and takes the larger of the two baseline deviations (lib/triage/engine.ts), so
// nothing stored here can ever lower urgency.
//
// The pure helpers (parse / build / convert) are exported separately from the IndexedDB calls so they
// can be tested in Node without a browser.
import { del, get, set } from 'idb-keyval';
import type { CheckId, CheckResult, TriageInput } from '../triage/types.ts';

/** Checks that can have a baseline. Speech is not baselined (it depends on a cloud recognizer). */
export type BaselineCheckId = Extract<CheckId, 'face' | 'arm'>;
export const BASELINE_CHECKS: readonly BaselineCheckId[] = ['face', 'arm'];

export interface BaselineEntry {
  /** Unsigned asymmetry score, as the metric reported it (>= 0). */
  score: number;
  /** Signed asymmetry, anatomical: positive = left weaker. |signed| === score. */
  signed: number;
}

export interface StoredBaseline {
  version: 1;
  /** When it was recorded (ms since epoch). */
  recordedAt: number;
  checks: Partial<Record<BaselineCheckId, BaselineEntry>>;
}

const KEY = 'facefirst.baseline.v1';

const finiteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * Validates data read back from IndexedDB (or anywhere untrusted). Returns null for anything
 * malformed, so a corrupt record simply means "no baseline" (the population thresholds still apply).
 */
export function parseBaseline(raw: unknown): StoredBaseline | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1 || !finiteNum(r.recordedAt) || !r.checks || typeof r.checks !== 'object') return null;
  const checks: StoredBaseline['checks'] = {};
  for (const id of BASELINE_CHECKS) {
    const e = (r.checks as Record<string, unknown>)[id];
    if (e === undefined) continue;
    if (!e || typeof e !== 'object') return null;
    const { score, signed } = e as Record<string, unknown>;
    if (!finiteNum(score) || !finiteNum(signed) || score < 0) return null;
    checks[id] = { score, signed };
  }
  if (Object.keys(checks).length === 0) return null;
  return { version: 1, recordedAt: r.recordedAt, checks };
}

/** The usable baseline entry from one measured check, or null if the capture cannot be a baseline. */
export function entryFromResult(result: CheckResult): BaselineEntry | null {
  if (result.status !== 'ok' || !finiteNum(result.score) || result.score < 0) return null;
  if (!finiteNum(result.signed)) return null;
  return { score: result.score, signed: result.signed };
}

/** Builds a baseline from measured checks. Returns null unless at least one check gave an `ok` reading. */
export function baselineFromResults(results: readonly CheckResult[], recordedAt: number): StoredBaseline | null {
  const checks: StoredBaseline['checks'] = {};
  for (const r of results) {
    if (!(BASELINE_CHECKS as readonly string[]).includes(r.id)) continue;
    const entry = entryFromResult(r);
    if (entry) checks[r.id as BaselineCheckId] = entry;
  }
  if (Object.keys(checks).length === 0) return null;
  return { version: 1, recordedAt, checks };
}

/** Converts a stored baseline into the two triage inputs. `null` (or not in use) gives no baseline. */
export function toTriageBaseline(b: StoredBaseline | null): Pick<TriageInput, 'baseline' | 'baselineSigned'> {
  if (!b) return { baseline: null, baselineSigned: null };
  const baseline: Partial<Record<CheckId, number>> = {};
  const baselineSigned: Partial<Record<CheckId, number>> = {};
  for (const id of BASELINE_CHECKS) {
    const e = b.checks[id];
    if (!e) continue;
    baseline[id] = e.score;
    baselineSigned[id] = e.signed;
  }
  return { baseline, baselineSigned };
}

// ---------- IndexedDB (browser only) ----------

/** Reads the saved baseline. Any storage error (private mode, blocked IndexedDB) reads as "none". */
export async function loadBaseline(): Promise<StoredBaseline | null> {
  try {
    return parseBaseline(await get(KEY));
  } catch {
    return null;
  }
}

/** Saves (replaces) the baseline. Throws if storage fails so the UI can say it was not saved. */
export async function saveBaseline(b: StoredBaseline): Promise<void> {
  const valid = parseBaseline(b);
  if (!valid) throw new Error('Refusing to save an invalid baseline');
  await set(KEY, valid);
}

export async function clearBaseline(): Promise<void> {
  await del(KEY);
}
