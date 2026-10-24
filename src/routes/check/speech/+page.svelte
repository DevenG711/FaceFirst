<!--
  Speech check. The program decides: word accuracy from speech recognition plus acoustic proxies
  for slurred speech from the microphone's amplitude envelope (lib/metrics/speech.ts). Both can only
  add a finding. The caregiver judgment buttons are a fallback, shown only when listening failed;
  a "slurred" answer is a caregiverReport, never a pass/fail (.kiro/steering/safety.md §1).
  The privacy disclosure is required by safety.md §4. The amplitude envelope is analyzed in the
  browser and never stored or sent.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { t } from '#lib/i18n/index.ts';
  import {
    rms,
    speechAcoustics,
    speechScore,
    speechTiming,
    words,
    type SpeechAcoustics,
  } from '#lib/metrics/speech.ts';
  import { triage } from '#lib/triage/engine.ts';
  import {
    ACOUSTIC_PARAMS,
    LISTEN_PARAMS,
    POPULATION_THRESHOLD,
    QUALITY,
  } from '#lib/triage/thresholds.ts';
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
    continuous: boolean;
    interimResults: boolean;
    maxAlternatives: number;
    onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
    onerror: ((e: { error: string }) => void) | null;
    onend: (() => void) | null;
    start(): void;
    stop(): void;
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

  type Phase = 'ready' | 'listening' | 'heard' | 'noSpeech' | 'unclear' | 'micDenied' | 'unsupported';
  let phase = $state<Phase>('ready');
  let heard = $state('');
  let judgment = $state<Judgment | null>(null);
  let recognition: Recognition | null = null;

  const dev = import.meta.env.DEV;

  /** Dev-only readout of what the program measured, for tuning the placeholders. Never in a build. */
  let debug = $state<{
    raw: string;
    samples: number;
    loudest: number;
    speakingMs: number;
    wordsOnly: number | null;
    acoustics: SpeechAcoustics | null;
    final: number | null;
    status: string;
  } | null>(null);
  const fmt = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toFixed(2));

  /** Dev-only: final scores of every scored attempt this session, to check run-to-run spread. */
  let history = $state<{ final: number; wordsOnly: number; acoustic: number }[]>([]);
  const spread = $derived.by(() => {
    const xs = history.map((h) => h.final);
    if (xs.length === 0) return null;
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length);
    return { mean, sd, min: Math.min(...xs), max: Math.max(...xs) };
  });

  /** Caregiver buttons only when the program could not listen or hear enough. */
  const showFallback = $derived(
    phase === 'unsupported' || phase === 'micDenied' || phase === 'noSpeech' || phase === 'unclear'
  );

  // --- Amplitude capture: RMS of the mic signal every ACOUSTIC_PARAMS.SAMPLE_MS while listening ---
  let amplitudes: number[] = [];
  let stopAudio = () => {};

  /** `onVoice` is called for every sample above the voiced floor, so the attempt knows someone is still talking. */
  async function startAudio(onVoice: () => void) {
    const samples: number[] = [];
    amplitudes = samples;
    let stopped = false;
    let release = () => {};
    stopAudio = () => {
      stopped = true;
      release();
    };
    let ctx: AudioContext | null = null;
    try {
      // Create and resume the context inside the tap, before any await: Chrome starts an
      // AudioContext created later in the "suspended" state, which records only silence.
      ctx = new AudioContext();
      void ctx.resume();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        void ctx.close();
        return;
      }
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser);
      const frame = new Float32Array(analyser.fftSize);
      let peak = 0;
      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(frame);
        const level = rms(frame);
        samples.push(level);
        peak = Math.max(peak, level);
        // Same adaptive floor as the metric (voicedFloor), using the loudest level so far.
        if (level > Math.max(QUALITY.SILENCE_LEVEL, ACOUSTIC_PARAMS.RELATIVE_SILENCE * peak)) onVoice();
      }, ACOUSTIC_PARAMS.SAMPLE_MS);
      const context = ctx;
      release = () => {
        clearInterval(timer);
        stream.getTracks().forEach((track) => track.stop());
        void context.close();
      };
    } catch {
      // No amplitude envelope: the word score stands alone. Acoustics could only have added a finding.
      void ctx?.close();
    }
  }

  onMount(() => {
    if (!recognitionCtor()) phase = 'unsupported';
    speak(t($locale, 'check.speech.instructions'), $locale);
    return () => {
      const rec = recognition;
      recognition = null; // ignore the abort's events
      clearWatch();
      rec?.abort();
      stopAudio();
    };
  });

  /** Ends the current attempt (the "Done speaking" button, or a listening limit). */
  let endAttempt = () => {};
  let clearWatch = () => {};

  /**
   * One attempt. The app, not the browser, decides when it is over: Chrome's recognizer stops after a
   * short silence, which would cut off slow, effortful speech. So recognition runs continuously and is
   * restarted if the browser ends it, and the attempt only ends on the "Done speaking" button or a
   * LISTEN_PARAMS limit: no speech at all for START_TIMEOUT_MS, END_SILENCE_MS of silence after speech
   * started, or MAX_LISTEN_MS in total.
   */
  function listen() {
    const Ctor = recognitionCtor();
    if (!Ctor) {
      phase = 'unsupported';
      return;
    }
    speechSynthesis?.cancel();
    recognition?.abort();
    clearWatch();
    stopAudio();

    const rec = new Ctor();
    recognition = rec;
    rec.lang = VOICE_LANG[$locale];
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    // Ignore events from an earlier attempt that is still shutting down.
    const current = () => recognition === rec;
    let transcript: string | null = null;
    let committed = ''; // text from earlier browser sessions within this attempt
    let ending = false;

    const startedAt = performance.now();
    let heardVoice = false;
    let lastVoiceAt = startedAt;
    const voice = () => {
      heardVoice = true;
      lastVoiceAt = performance.now();
    };

    const end = () => {
      if (ending) return;
      ending = true;
      try {
        rec.stop(); // delivers any pending words, then onend finishes the attempt
      } catch {
        // already stopped; onend has run or will run
      }
    };
    endAttempt = end;

    const watch = setInterval(() => {
      const now = performance.now();
      const silentFor = now - lastVoiceAt;
      if (
        now - startedAt >= LISTEN_PARAMS.MAX_LISTEN_MS ||
        (heardVoice
          ? silentFor >= LISTEN_PARAMS.END_SILENCE_MS
          : now - startedAt >= LISTEN_PARAMS.START_TIMEOUT_MS)
      ) {
        end();
      }
    }, ACOUSTIC_PARAMS.SAMPLE_MS);
    clearWatch = () => clearInterval(watch);

    rec.onresult = (e) => {
      if (!current()) return;
      const text = Array.from(e.results, (r) => r[0]?.transcript ?? '').join(' ');
      transcript = `${committed} ${text}`.trim();
      voice(); // new words also count as "still talking", even without the amplitude envelope
    };
    rec.onerror = (e) => {
      if (!current()) return;
      if (['not-allowed', 'service-not-allowed', 'audio-capture'].includes(e.error)) {
        phase = 'micDenied';
        ending = true;
      } else if (e.error === 'network' || e.error === 'language-not-supported') {
        ending = true; // restarting would fail the same way
      }
    };
    rec.onend = () => {
      if (!current()) return;
      if (!ending) {
        // The browser stopped on its own (often after a pause). Keep listening.
        committed = transcript ?? committed;
        try {
          rec.start();
          return;
        } catch {
          // could not restart: finish with what we have
        }
      }
      clearWatch();
      stopAudio();
      finish(transcript);
    };

    phase = 'listening';
    void startAudio(voice);
    rec.start();
  }

  /** The program's decision: word accuracy + acoustic proxies, one CheckResult for the engine. */
  function finish(transcript: string | null) {
    if (phase === 'micDenied') {
      setCheck(unavailableCheck('speech'));
      return;
    }
    // An attempt was made, so no transcript means "heard nothing" (poor_quality), not "unavailable".
    const phrase = t($locale, 'check.speech.phrase');
    const result = speechScore(transcript ?? '', phrase, {
      audio: { amplitudes, sampleMs: ACOUSTIC_PARAMS.SAMPLE_MS },
    });
    setCheck(result);
    if (dev) {
      debug = {
        raw: JSON.stringify(amplitudes.map((a) => Math.round(a * 1000) / 1000)),
        samples: amplitudes.length,
        loudest: Math.max(0, ...amplitudes),
        speakingMs: speechTiming(amplitudes, ACOUSTIC_PARAMS.SAMPLE_MS).speakingMs,
        wordsOnly: speechScore(transcript ?? '', phrase).score,
        acoustics: speechAcoustics(amplitudes, ACOUSTIC_PARAMS.SAMPLE_MS, words(phrase).length),
        final: result.score,
        status: result.status,
      };
      if (result.status === 'ok') {
        history = [
          ...history,
          {
            final: result.score ?? 0,
            wordsOnly: debug.wordsOnly ?? 0,
            acoustic: debug.acoustics?.score ?? 0,
          },
        ];
      }
    }
    heard = transcript ?? '';
    phase = result.status === 'ok' ? 'heard' : transcript ? 'unclear' : 'noSpeech';
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

  {#if phase === 'listening'}
    <button type="button" class="button secondary" onclick={() => endAttempt()}>
      {t($locale, 'check.speech.done')}
    </button>
  {/if}

  <div class="status" aria-live="polite">
    {#if phase === 'listening'}
      <p>{t($locale, 'check.speech.listening')}</p>
    {:else if phase === 'heard'}
      <p>{t($locale, 'check.common.complete')}</p>
      <p>{t($locale, 'check.speech.heard')} “{heard}”</p>
    {:else if phase !== 'ready'}
      <p>{t($locale, `check.speech.${phase}`)}</p>
    {/if}
  </div>

  {#if dev && debug}
    <!-- Dev-only tuning readout (not shown in production builds), so not translated. -->
    <dl class="debug">
      <dt>status</dt><dd>{debug.status}</dd>
      <dt>audio samples</dt><dd>{debug.samples} (loudest {fmt(debug.loudest)})</dd>
      <dt>speech line</dt><dd>{fmt(debug.acoustics?.floor)} (quieter = silence)</dd>
      <dt>speaking ms</dt><dd>{debug.speakingMs}</dd>
      <dt>words/sec</dt><dd>{fmt(debug.acoustics?.wordsPerSecond)} (slow below {ACOUSTIC_PARAMS.MIN_WORDS_PER_SEC})</dd>
      <dt>pause share</dt><dd>{fmt(debug.acoustics?.pauseRatio)} (counts above {ACOUSTIC_PARAMS.MAX_PAUSE_RATIO})</dd>
      <dt>longest pause ms</dt><dd>{debug.acoustics?.longestPauseMs ?? '—'} (counts above {ACOUSTIC_PARAMS.LONG_PAUSE_MS})</dd>
      <dt>loudness variation</dt><dd>{fmt(debug.acoustics?.envelopeCv)} (flat below {ACOUSTIC_PARAMS.MIN_ENVELOPE_CV})</dd>
      <dt>acoustic score</dt><dd>{fmt(debug.acoustics?.score)}</dd>
      <dt>word-only score</dt><dd>{fmt(debug.wordsOnly)}</dd>
      <dt>final score</dt><dd>{fmt(debug.final)} (flags above {POPULATION_THRESHOLD.speech})</dd>
      <dt>raw samples</dt>
      <dd>
        <button type="button" class="copy" onclick={() => navigator.clipboard?.writeText(debug?.raw ?? '')}>
          Copy samples
        </button>
      </dd>
      {#if spread}
        <dt>this session</dt>
        <dd>
          {history.length} runs · mean {fmt(spread.mean)} · SD {fmt(spread.sd)} · range {fmt(spread.min)}–{fmt(spread.max)}
          <button type="button" class="copy" onclick={() => (history = [])}>Reset</button>
        </dd>
        <dt>runs (final = words + acoustic)</dt>
        <dd>
          {#each history as h, i (i)}
            <div>#{i + 1}: {fmt(h.final)} = {fmt(h.wordsOnly)} + {ACOUSTIC_PARAMS.ACOUSTIC_WEIGHT}×{fmt(h.acoustic)}</div>
          {/each}
        </dd>
      {/if}
    </dl>
  {/if}

  {#if showFallback}
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
  {/if}

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

  .debug {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.1rem 0.75rem;
    margin: 0;
    padding: 0.75rem;
    border: 2px dashed #555555;
    border-radius: 8px;
    font: 14px/1.4 ui-monospace, monospace;
  }

  .debug dd {
    margin: 0;
  }

  .debug .copy {
    min-height: 32px;
    padding: 0 0.75rem;
    font: inherit;
  }
</style>
