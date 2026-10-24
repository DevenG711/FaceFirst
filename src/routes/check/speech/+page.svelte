<!--
  Speech check. Two inputs, both optional: speech recognition (if the browser has it) and a
  caregiver judgment. The caregiver answer is an observation fed to the triage engine as a
  caregiverReport, never a pass/fail (.kiro/steering/safety.md §1). The privacy disclosure
  is required by safety.md §4.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { t } from '#lib/i18n/index.ts';
  import { speechErrorScore } from '#lib/metrics/speech.ts';
  import { triage } from '#lib/triage/engine.ts';
  import {
    caregiverReports,
    checks,
    locale,
    setCaregiverReport,
    setCheck,
    unavailableCheck,
  } from '#lib/stores/session.ts';
  import { speak, VOICE_LANG } from '#lib/voice.ts';
  import FlowProgress from '#lib/components/FlowProgress.svelte';
  const JUDGMENTS = ['slurred', 'noChange', 'notSure'] as const;
  type Judgment = (typeof JUDGMENTS)[number];

  // Minimal Web Speech API surface; not every TypeScript DOM lib declares it.
  interface Recognition {
    lang: string;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
    onerror: ((e: { error: string }) => void) | null;
    onend: (() => void) | null;
    start(): void;
    abort(): void;
  }
  type RecognitionCtor = new () => Recognition;

  const recognitionCtor = (): RecognitionCtor | undefined => {
    const w = window as unknown as {
      SpeechRecognition?: RecognitionCtor;
      webkitSpeechRecognition?: RecognitionCtor;
    };
    return w.SpeechRecognition ?? w.webkitSpeechRecognition;
  };

  let phase = $state<'ready' | 'listening' | 'heard' | 'noSpeech' | 'micDenied' | 'unsupported'>(
    'ready'
  );
  let heard = $state('');
  let judgment = $state<Judgment | null>(null);
  let recognition: Recognition | null = null;

  onMount(() => {
    if (!recognitionCtor()) phase = 'unsupported';
    speak(t($locale, 'check.speech.instructions'), $locale);
    return () => recognition?.abort();
  });

  function listen() {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      phase = 'unsupported';
      return;
    }
    speechSynthesis?.cancel();
    recognition?.abort();

    const rec = new Ctor();
    recognition = rec;
    rec.lang = VOICE_LANG[$locale];
    rec.interimResults = false;
    rec.maxAlternatives = 1;

    // Ignore events from an earlier attempt that is still shutting down.
    const current = () => recognition === rec;

    rec.onresult = (e) => {
      if (!current()) return;
      heard = e.results[0]?.[0]?.transcript ?? '';
      phase = 'heard';
      setCheck({
        id: 'speech',
        status: 'ok',
        score: speechErrorScore(t($locale, 'check.speech.phrase'), heard),
        side: null,
      });
    };
    rec.onerror = (e) => {
      if (!current()) return;
      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(e.error)) {
        phase = 'micDenied';
        setCheck(unavailableCheck('speech'));
      } else if (e.error !== 'aborted') {
        phase = 'noSpeech';
      }
    };
    rec.onend = () => {
      if (!current()) return;
      if (phase === 'listening') phase = 'noSpeech';
      // Nothing usable was heard: ask for a retry rather than treating it as fine.
      if (phase === 'noSpeech') setCheck({ id: 'speech', status: 'poor_quality', score: null, side: null });
    };

    phase = 'listening';
    rec.start();
  }

  function judge(answer: Judgment) {
    judgment = answer;
    setCaregiverReport('speech_wrong', answer === 'slurred');
  }

  /**
   * Sensor-first routing. A preliminary triage on the sensor checks and caregiver reports (no
   * BE-FAST answers yet; baseline null, as on /result) decides whether the questions are needed:
   * any finding already means CALL_911_NOW, so go straight to the result. Otherwise offer the
   * optional questions, which can only add findings, never remove them.
   */
  function next() {
    const preliminary = triage({
      checks: get(checks),
      beFast: {},
      caregiverReports: get(caregiverReports),
      baseline: null,
    });
    goto(preliminary.state === 'CALL_911_NOW' ? '/result' : '/check/befast');
  }
</script>

<div class="check">
  <FlowProgress locale={$locale} step={3} />
  <h1>{t($locale, 'check.speech.title')}</h1>
  <p class="instructions">{t($locale, 'check.speech.instructions')}</p>
  <p class="phrase" lang={$locale}>{t($locale, 'check.speech.phrase')}</p>

  {#if phase !== 'unsupported'}
    <p class="disclosure">{t($locale, 'check.speech.disclosure')}</p>
    <button
      type="button"
      class="button primary"
      onclick={listen}
      disabled={phase === 'listening' || phase === 'micDenied'}
    >
      {t($locale, 'check.speech.start')}
    </button>
  {/if}

  <div class="status" aria-live="polite">
    {#if phase === 'listening'}
      <p>{t($locale, 'check.speech.listening')}</p>
    {:else if phase === 'heard'}
      <p>{t($locale, 'check.common.complete')}</p>
      <p>{t($locale, 'check.speech.heard')} “{heard}”</p>
    {:else if phase === 'noSpeech' || phase === 'micDenied' || phase === 'unsupported'}
      <p>{t($locale, `check.speech.${phase}`)}</p>
    {/if}
  </div>

  <fieldset class="caregiver">
    <legend>{t($locale, 'check.speech.caregiver.question')}</legend>
    {#each JUDGMENTS as answer (answer)}
      <button
        type="button"
        class="button secondary"
        aria-pressed={judgment === answer}
        onclick={() => judge(answer)}
      >
        {t($locale, `check.speech.caregiver.${answer}`)}
      </button>
    {/each}
  </fieldset>

  <div class="actions">
    <button type="button" class="button secondary" onclick={next}>
      {t($locale, 'check.common.next')}
    </button>
  </div>
</div>

<style>
  .check {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-height: calc(100dvh - var(--tap-min) - 2rem);
  }

  h1,
  .instructions,
  .status p {
    margin: 0;
  }

  .phrase {
    margin: 0;
    padding: 1rem;
    border: 2px solid var(--color-fg);
    border-radius: 8px;
    font-size: 32px;
    font-weight: 700;
    text-align: center;
  }

  .disclosure {
    margin: 0;
  }

  .status {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-weight: 700;
    min-height: 1.5em;
  }

  .button:disabled {
    opacity: 0.6;
    cursor: default;
  }

  .caregiver {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    font-weight: 700;
    margin-bottom: 0.5rem;
  }

  .caregiver .button[aria-pressed='true'] {
    border-color: var(--color-focus);
    box-shadow: inset 0 0 0 2px var(--color-focus);
  }

  .actions {
    margin-top: auto;
  }
</style>
