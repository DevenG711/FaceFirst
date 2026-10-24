// State → i18n keys for the result screen. Every reachable string goes through here so
// tests/copy-safety.test.ts can enumerate and scan it. See .kiro/specs/triage-engine/design.md (Copy).
import { t, type Locale } from '#lib/i18n/index.ts';
import type { CheckId, Reason, TriageResult, TriageState } from './types.ts';

/** Re-exported so callers can render keys from `resultCopy` without a second import. */
export { t };

export type CopyParams = Record<string, string>;

export interface ResultCopy {
  titleKey: string;
  bodyKeys: string[];
  actionKeys: string[];
  /** Interpolation values for the keys above, already localized. Pass to `t(locale, key, params)`. */
  params: CopyParams;
  colorToken: TriageResult['colorToken'];
  /** Resolved, interpolated strings in `locale` (convenience; same as t(locale, key, params)). */
  title: string;
  body: string[];
  actions: string[];
}

/** "If you noticed sudden symptoms, call 911." Appended to every non-red state (safety.md §1–2). */
export const CALL_911_LINE_KEY = 'result.call911Line';

const STATE_COPY: Record<
  TriageState,
  { title: string; body: string[]; actions: string[]; color: TriageResult['colorToken'] }
> = {
  CALL_911_NOW: {
    title: 'result.call911.title',
    body: ['result.call911.body'],
    actions: [],
    color: 'act',
  },
  CANNOT_RULE_OUT: {
    title: 'result.cannotRuleOut.title',
    // Joined, these read exactly "This check cannot rule out a stroke. If you noticed sudden symptoms, call 911."
    body: ['result.cannotRuleOut.body', CALL_911_LINE_KEY],
    // Untimed re-check on purpose: a timed one ("in 5 minutes") suggests waiting (safety.md §2).
    actions: ['result.cannotRuleOut.recheck'],
    color: 'caution',
  },
  RETRY_CAPTURE: {
    title: 'result.retry.title',
    body: ['result.retry.body', CALL_911_LINE_KEY],
    actions: [],
    color: 'caution',
  },
};

/** Sided label when the check is flagged with a known anatomical side; speech has no side. */
function reasonLabel(r: Reason, locale: Locale): string {
  switch (r.kind) {
    case 'check_flagged':
      // A baseline flag says what changed compared with the person's own usual reading.
      if (r.basis === 'baseline') {
        return r.side && r.check !== 'speech'
          ? t(locale, `result.reason.baselineSided.${r.check}`, { side: t(locale, `result.side.${r.side}`) })
          : t(locale, `result.reason.baseline.${r.check}`);
      }
      return r.side && r.check !== 'speech'
        ? t(locale, `result.reason.checkSided.${r.check}`, { side: t(locale, `result.side.${r.side}`) })
        : t(locale, `result.reason.check.${r.check}`);
    case 'befast_yes':
      return t(locale, `result.reason.befast.${r.question}`);
    case 'caregiver':
      return t(locale, `result.reason.caregiver.${r.report}`);
  }
}

const checkLabel = (c: CheckId, locale: Locale): string => t(locale, `result.check.${c}`);

export function resultCopy(result: TriageResult, locale: Locale): ResultCopy {
  const copy = STATE_COPY[result.state];
  const params: CopyParams = {
    reasons: [...new Set(result.reasons.map((r) => reasonLabel(r, locale)))].join(', '),
    checks: result.retryChecks.map((c) => checkLabel(c, locale)).join(', '),
  };
  const render = (key: string) => t(locale, key, params);
  return {
    titleKey: copy.title,
    bodyKeys: [...copy.body],
    actionKeys: [...copy.actions],
    params,
    colorToken: copy.color,
    title: render(copy.title),
    body: copy.body.map(render),
    actions: copy.actions.map(render),
  };
}
