// Session state shared across the check flow (home → checks → result → EMS card).
// In memory only: nothing here is saved or sent anywhere (.kiro/steering/safety.md §4).
import { writable } from 'svelte/store';
import { DEFAULT_LOCALE, type Locale } from '#lib/i18n/index.ts';
import type {
  Answer,
  BeFastQuestion,
  CaregiverReport,
  CheckId,
  CheckResult,
} from '#lib/triage/types.ts';

export const locale = writable<Locale>(DEFAULT_LOCALE);

/** Answers to "When did the symptoms start?" — keys under home.timeNoticed.* */
export const SYMPTOM_ONSET_OPTIONS = [
  'justNow',
  'lastHour',
  'oneToThreeHours',
  'moreThanThreeHours',
  'notSure',
] as const;
export type SymptomOnset = (typeof SYMPTOM_ONSET_OPTIONS)[number];

export interface SymptomOnsetRecord {
  choice: SymptomOnset;
  /** When the answer was given (ms since epoch), so the EMS card can show a clock time. */
  recordedAt: number;
}

export const symptomOnset = writable<SymptomOnsetRecord | null>(null);

/** A check that was skipped or could not run. */
export const unavailableCheck = (id: CheckId): CheckResult => ({
  id,
  status: 'unavailable',
  score: null,
  side: null,
});

export const checks = writable<Record<CheckId, CheckResult>>({
  face: unavailableCheck('face'),
  arm: unavailableCheck('arm'),
  speech: unavailableCheck('speech'),
});

export function setCheck(result: CheckResult): void {
  checks.update((all) => ({ ...all, [result.id]: result }));
}

/** What a caregiver or bystander says they saw. Fed to the triage engine, never a pass/fail. */
export const caregiverReports = writable<CaregiverReport[]>([]);

/** BE-FAST answers, in the order they are asked. */
export const BEFAST_QUESTIONS: readonly BeFastQuestion[] = [
  'balance',
  'vision',
  'headache',
  'numbness',
];

export const beFast = writable<Partial<Record<BeFastQuestion, Answer>>>({});

export function setBeFastAnswer(question: BeFastQuestion, answer: Answer): void {
  beFast.update((all) => ({ ...all, [question]: answer }));
}

export function setCaregiverReport(report: CaregiverReport, observed: boolean): void {
  caregiverReports.update((all) => {
    const others = all.filter((r) => r !== report);
    return observed ? [...others, report] : others;
  });
}
