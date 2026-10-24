// Spoken prompts via speechSynthesis. Every screen with a voice prompt also shows the same
// text on screen (.kiro/steering/design.md), so a silent browser loses nothing.
import type { Locale } from '#lib/i18n/index.ts';

/** BCP 47 tags for speaking and for speech recognition. */
export const VOICE_LANG: Record<Locale, string> = { en: 'en-US', es: 'es-US', pt: 'pt-BR' };

/** Speaks `text`, replacing anything already being spoken. No-op where unsupported. */
export function speak(text: string, locale: Locale): void {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = VOICE_LANG[locale];
  speechSynthesis.speak(utterance);
}
