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
  import {
    ACOUSTIC_PARAMS,
    LISTEN_PARAMS,
    POPULATION_THRESHOLD,
    QUALITY,
  } from '#lib/triage/thresholds.ts';
  import { locale, setCaregiverReport, setCheck, unavailableCheck } from '#lib/stores/session.ts';
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

  // --- Wave bars: the most recent mic levels while listening, relative to the loudest so far ---
  const BARS = 22;
  // Resting shape from the design, shown (still) when not listening.
  const REST = [14, 22, 34, 50, 72, 58, 44, 80, 96, 70, 52, 88, 100, 76, 54, 82, 64, 46, 60, 40, 28, 20];
  let live = $state<number[]>([]);
  const barHeights = $derived(
    phase === 'listening' && live.length > 0
      ? Array.from({ length: BARS }, (_, i) => 8 + 92 * (live[live.length - BARS + i] ?? 0))
      : REST.map((h) => h * 0.35)
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
        live = [...live.slice(1 - BARS), peak > 0 ? level / peak : 0];
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
    live = [];
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
   * Main flow is face -> arms -> voice -> result. The optional BE-FAST questions are offered from the
   * amber result screen, where they can only add findings, never remove them.
   */
  const next = () => goto('/result');
</script>

<div class="check">
  <FlowProgress locale={$locale} step={3} />
  <h1>{t($locale, 'check.speech.headline')} <em>{t($locale, 'check.speech.headlineEm')}</em></h1>
  <p class="sub">{t($locale, 'check.speech.instructions')}</p>

  <div class="panel quote">
    <p lang={$locale}>“{t($locale, 'check.speech.phrase')}”</p>
  </div>

  <div class="wave" class:live={phase === 'listening'} aria-hidden="true">
    {#each barHeights as h, i (i)}
      <i style:height="{h}px"></i>
    {/each}
  </div>

  <div class="status" aria-live="polite">
    {#if phase === 'listening'}
      <p><span class="dot pulse"></span> {t($locale, 'check.speech.listening')}</p>
    {:else if phase === 'heard'}
      <p>{t($locale, 'check.common.complete')}</p>
      <p class="small">{t($locale, 'check.speech.heard')} “{heard}”</p>
    {:else if phase !== 'ready'}
      <p class="caution">{t($locale, `check.speech.${phase}`)}</p>
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
          class="btn btn-outline btn-wide"
          aria-pressed={judgment === answer}
          onclick={() => judge(answer)}
        >
          {t($locale, `check.speech.caregiver.${answer}`)}
        </button>
      {/each}
    </fieldset>
  {/if}

  <div class="actions between">
    <a href="/check/arm" class="btn btn-outline">{t($locale, 'check.common.back')}</a>

    {#if phase === 'listening'}
      <button type="button" class="btn btn-primary" onclick={() => endAttempt()}>
        {t($locale, 'check.speech.done')}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10" /></svg>
      </button>
    {:else if phase === 'heard' || phase === 'unsupported' || phase === 'micDenied'}
      <button type="button" class="btn btn-primary" onclick={next}>
        {t($locale, 'check.common.seeResult')}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
    {:else}
      <button type="button" class="btn btn-primary" onclick={listen}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
        {t($locale, 'check.speech.start')}
      </button>
    {/if}
  </div>

  {#if phase === 'heard'}
    <button type="button" class="link" onclick={listen}>{t($locale, 'check.speech.start')}</button>
  {:else if phase === 'noSpeech' || phase === 'unclear'}
    <button type="button" class="link" onclick={next}>{t($locale, 'check.common.seeResult')}</button>
  {/if}

  {#if phase !== 'unsupported'}
    <p class="small disclosure">{t($locale, 'check.speech.disclosure')}</p>
  {/if}
</div>

<style>
  .quote {
    margin-top: 36px;
    padding: 44px 40px;
  }

  .quote p {
    margin: 0;
    font-family: var(--serif);
    font-style: italic;
    font-size: clamp(2.2rem, 5vw, 3.2rem);
    line-height: 1.15;
  }

  .wave {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    height: 110px;
    margin-top: 36px;
  }

  .wave i {
    display: block;
    width: 5px;
    border-radius: 3px;
    background: var(--color-line);
    transition: height 0.05s linear;
  }

  .wave.live i {
    background: var(--color-accent);
  }

  .status {
    min-height: 1.5em;
    margin-top: 12px;
    text-align: center;
  }

  .status p {
    margin: 0;
  }

  .status .caution {
    color: var(--color-caution-soft);
  }

  .caregiver {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin: 32px 0 0;
    padding: 0;
    border: 0;
  }

  legend {
    margin-bottom: 12px;
    font-size: 1.1rem;
    font-weight: 500;
  }

  .caregiver .btn[aria-pressed='true'] {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  .link {
    display: block;
    min-height: var(--tap-min);
    margin: 16px auto 0;
    padding: 0 16px;
    border: 0;
    background: none;
    color: var(--color-muted);
    font-size: 1rem;
    text-decoration: underline;
    text-underline-offset: 4px;
    cursor: pointer;
  }

  .disclosure {
    margin: 24px 0 0;
    text-align: center;
  }

  .debug {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.1rem 0.75rem;
    margin: 32px 0 0;
    padding: 0.75rem;
    border: 2px dashed var(--color-line);
    border-radius: 12px;
    font: 14px/1.4 ui-monospace, monospace;
    color: var(--color-muted);
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
