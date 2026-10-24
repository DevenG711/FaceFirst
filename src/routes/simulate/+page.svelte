<!--
  /simulate — DEV-ONLY test console. The frictionless way to exercise the WHOLE real pipeline without
  a camera: pick a scenario, see the real metric + triage verdict inline, one click to the real result
  screen. It replays the SAME synthetic clips the Vitest fixtures use (src/lib/dev/scenarios.ts) through
  the SAME real metrics and the SAME real triage engine, so what you see here is exactly what the app
  does.

  This page is NOT product. It is guarded by import.meta.env.DEV and redirects home in a production
  build (and the harness it uses is tree-shaken out), so it never ships to a user. It only writes
  inputs and reads the engine's own output — it cannot invent a "pass" state (the engine has none) and
  never touches the 911 control.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { get } from 'svelte/store';
  import {
    checks,
    beFast,
    caregiverReports,
    locale,
    setCheck,
    setBeFastAnswer,
    setCaregiverReport,
    unavailableCheck,
    BEFAST_QUESTIONS,
  } from '#lib/stores/session.ts';
  import { triage } from '#lib/triage/engine.ts';
  import { resultCopy } from '#lib/triage/copy.ts';
  import { faceAsymmetry } from '#lib/metrics/faceAsymmetry.ts';
  import { armDrift } from '#lib/metrics/armDrift.ts';
  import { speechScore } from '#lib/metrics/speech.ts';
  import { faceFrameFromResult, armFrameFromResult } from '#lib/vision/mapFrames.ts';
  import { FACE_SCENARIOS, ARM_SCENARIOS } from '#lib/dev/scenarios.ts';
  import type { CheckId, CheckResult } from '#lib/triage/types.ts';
  import { installTestHarness } from '#lib/dev/testHarness.ts';

  const DEV = import.meta.env.DEV;
  const W = 640;
  const H = 480;
  const SPEECH_TARGET = 'the sky is blue in cincinnati';

  onMount(() => {
    if (!DEV) {
      goto('/');
      return;
    }
    installTestHarness(); // so window.facefirst is also available while on this page
  });

  // --- running the real metrics over the shared synthetic clips --------------------------------
  function runFace(name: keyof typeof FACE_SCENARIOS): CheckResult {
    const frames = FACE_SCENARIOS[name]().map((r) => (r ? faceFrameFromResult(r, W, H) : null));
    return faceAsymmetry(frames, { mirrored: false });
  }
  function runArm(name: keyof typeof ARM_SCENARIOS): CheckResult {
    const frames = ARM_SCENARIOS[name]().map((r) => (r ? armFrameFromResult(r, W, H) : null));
    return armDrift(frames, { mirrored: false });
  }

  const FACE_CASES = Object.keys(FACE_SCENARIOS) as (keyof typeof FACE_SCENARIOS)[];
  const ARM_CASES = Object.keys(ARM_SCENARIOS) as (keyof typeof ARM_SCENARIOS)[];
  const SPEECH_CASES: { label: string; run: () => CheckResult }[] = [
    { label: 'perfect', run: () => speechScore(SPEECH_TARGET, SPEECH_TARGET, { speakingMs: 3000 }) },
    { label: 'slurred (half words)', run: () => speechScore('the sky', SPEECH_TARGET, { speakingMs: 3000 }) },
    { label: 'too little speech', run: () => speechScore('the', SPEECH_TARGET, { speakingMs: 200 }) },
    { label: 'no recognizer', run: () => speechScore(null, SPEECH_TARGET) },
  ];

  // --- live verdict preview (reactive on the stores) -------------------------------------------
  const result = $derived(
    triage({ checks: $checks, beFast: $beFast, caregiverReports: $caregiverReports, baseline: null })
  );
  const copy = $derived(resultCopy(result, $locale));

  // --- actions ---------------------------------------------------------------------------------
  function setFace(name: keyof typeof FACE_SCENARIOS) {
    setCheck(runFace(name));
  }
  function setArm(name: keyof typeof ARM_SCENARIOS) {
    setCheck(runArm(name));
  }
  function setSpeech(run: () => CheckResult) {
    setCheck(run());
  }
  function resetAll() {
    for (const id of ['face', 'arm', 'speech'] as CheckId[]) setCheck(unavailableCheck(id));
    beFast.set({});
    caregiverReports.set([]);
  }
  function loadClear911() {
    // A canonical "obvious stroke" scenario in one click: left face droop + left arm drift.
    setCheck(runFace('leftDroop'));
    setCheck(runArm('leftDrift'));
    setSpeech(() => speechScore('the sky', SPEECH_TARGET, { speakingMs: 3000 }));
  }

  function statusOf(id: CheckId): CheckResult {
    return get(checks)[id];
  }
</script>

{#if DEV}
  <div class="sim">
    <header>
      <h1>Simulate</h1>
      <p class="sub">
        Dev-only test console. Replays the same synthetic clips the automated tests use, through the
        real metrics and the real triage engine. Nothing here ships to a user.
      </p>
    </header>

    <!-- Live verdict: updates the instant you click a scenario. -->
    <section class="verdict {result.colorToken}" aria-live="polite">
      <div class="state">{result.state}</div>
      <div class="headline">{copy.title}</div>
      {#if result.reasons.length}
        <div class="reasons">{result.reasons.length} reason(s) flagged</div>
      {/if}
    </section>

    <!-- Current inputs at a glance. -->
    <section class="panel">
      <h2>Current inputs</h2>
      <table>
        <thead><tr><th>check</th><th>status</th><th>score</th><th>side</th></tr></thead>
        <tbody>
          {#each ['face', 'arm', 'speech'] as const as id (id)}
            {@const c = $checks[id]}
            <tr>
              <td>{id}</td>
              <td>{c.status}</td>
              <td>{c.score === null ? '—' : c.score.toFixed(4)}</td>
              <td>{c.side ?? '—'}</td>
            </tr>
          {/each}
        </tbody>
      </table>
      <p class="mini">BE-FAST: {JSON.stringify($beFast)} · caregiver: {JSON.stringify($caregiverReports)}</p>
    </section>

    <!-- One-click presets. -->
    <section class="panel">
      <h2>One click</h2>
      <div class="row">
        <button type="button" class="big" onclick={loadClear911}>Obvious stroke → 911</button>
        <button type="button" onclick={resetAll}>Reset all</button>
        <a class="button" href="/result">Go to result →</a>
      </div>
    </section>

    <!-- Face scenarios. -->
    <section class="panel">
      <h2>Face clip</h2>
      <div class="row">
        {#each FACE_CASES as name (name)}
          <button type="button" onclick={() => setFace(name)}>{name}</button>
        {/each}
      </div>
    </section>

    <!-- Arm scenarios. -->
    <section class="panel">
      <h2>Arm clip</h2>
      <div class="row">
        {#each ARM_CASES as name (name)}
          <button type="button" onclick={() => setArm(name)}>{name}</button>
        {/each}
      </div>
    </section>

    <!-- Speech scenarios. -->
    <section class="panel">
      <h2>Speech</h2>
      <div class="row">
        {#each SPEECH_CASES as c (c.label)}
          <button type="button" onclick={() => setSpeech(c.run)}>{c.label}</button>
        {/each}
      </div>
    </section>

    <!-- BE-FAST + caregiver toggles (any 'yes' escalates). -->
    <section class="panel">
      <h2>BE-FAST (yes escalates)</h2>
      <div class="row">
        {#each BEFAST_QUESTIONS as q (q)}
          <button
            type="button"
            class:on={$beFast[q] === 'yes'}
            onclick={() => setBeFastAnswer(q, $beFast[q] === 'yes' ? 'no' : 'yes')}
          >{q}: {$beFast[q] ?? 'unset'}</button>
        {/each}
      </div>
    </section>

    <p class="console-hint">
      Also available in the browser console:
      <code>facefirst.reset().faceClip('leftDroop').evaluate().show()</code>
    </p>
  </div>
{/if}

<style>
  .sim {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  header h1 {
    margin: 0;
  }

  .sub,
  .mini,
  .console-hint {
    margin: 0;
    color: var(--color-muted);
    font-size: 0.95rem;
  }

  .verdict {
    padding: 1rem;
    border-radius: var(--radius);
    border: 3px solid var(--color-fg);
    background: var(--color-surface);
    color: var(--color-fg);
  }

  /* Only the two sanctioned tokens; there is no reassuring/pass color. */
  .verdict.act {
    border-color: var(--color-act);
    background: var(--color-act);
    color: var(--color-act-text);
  }
  .verdict.caution {
    border-color: var(--color-caution);
    background: var(--color-caution);
    color: var(--color-caution-text);
  }

  .verdict .state {
    font-weight: 800;
    font-size: 1.4rem;
  }
  .verdict .headline {
    font-size: 1.1rem;
    margin-top: 0.25rem;
  }
  .verdict .reasons {
    margin-top: 0.25rem;
    opacity: 0.85;
  }

  .panel {
    padding: 0.75rem 1rem;
    border: 2px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-surface);
    color: var(--color-fg);
  }

  .panel h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  button,
  .button {
    min-height: 2.75rem;
    padding: 0 0.9rem;
    border: 2px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-bg);
    color: var(--color-fg);
    cursor: pointer;
    font: inherit;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
  }

  button:hover,
  .button:hover {
    border-color: var(--color-fg);
  }

  button.big {
    font-weight: 700;
  }

  button.on {
    background: var(--color-fg);
    color: var(--color-bg);
    border-color: var(--color-fg);
    font-weight: 700;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0.5rem;
  }
  th,
  td {
    text-align: left;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--color-border);
    font-variant-numeric: tabular-nums;
  }

  code {
    padding: 0.1rem 0.35rem;
    border-radius: 4px;
    background: var(--color-bg);
    border: 1px solid var(--color-border);
  }
</style>
