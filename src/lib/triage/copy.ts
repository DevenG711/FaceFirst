// State → i18n keys for the result screen. Every reachable string goes through here so
// tests/copy-safety.test.ts can enumerate and scan it. See .kiro/specs/triage-engine/design.md (Copy).
import { t, type Locale } from '#lib/i18n/index.ts';
import type { CheckId, Reason, TriageResult, TriageState } from './types.ts';

export interface ResultCopy {
  titleKey: string;
  bodyKeys: string[];
  actionKeys: string[];
  colorToken: TriageResult['colorToken'];
  /** Resolved, interpolated strings in `locale`. */
  title: string;
  body: string[];
  actions: string[];
}

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
    body: ['result.cannotRuleOut.body'],
    actions: ['result.cannotRuleOut.recheck'],
    color: 'caution',
  },
  RETRY_CAPTURE: {
    title: 'result.retry.title',
    body: ['result.retry.body'],
    actions: [],
    color: 'caution',
  },
};

function reasonKey(r: Reason): string {
  switch (r.kind) {
    case 'check_flagged':
      return `result.reason.check.${r.check}`;
    case 'befast_yes':
      return `result.reason.befast.${r.question}`;
    case 'caregiver':
      return `result.reason.caregiver.${r.report}`;
  }
}

const checkKey = (c: CheckId): string => `result.check.${c}`;

export function resultCopy(result: TriageResult, locale: Locale): ResultCopy {
  const copy = STATE_COPY[result.state];
  const params = {
    reasons: [...new Set(result.reasons.map(reasonKey))].map((k) => t(locale, k)).join(', '),
    checks: result.retryChecks.map((c) => t(locale, checkKey(c))).join(', '),
  };
  const render = (key: string) => t(locale, key, params);

  return {
    titleKey: copy.title,
    bodyKeys: copy.body,
    actionKeys: copy.actions,
    colorToken: copy.color,
    title: render(copy.title),
    body: copy.body.map(render),
    actions: copy.actions.map(render),
  };
}
