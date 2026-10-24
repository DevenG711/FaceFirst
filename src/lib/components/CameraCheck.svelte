<!--
  One camera check screen (face or arm). Never show a green check or "all clear" when
  done: only a neutral "Check complete" (.kiro/steering/safety.md §1).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from '#lib/i18n/index.ts';
  import CameraView from '#lib/components/CameraView.svelte';
  import { locale, setCheck, unavailableCheck } from '#lib/stores/session.ts';
  import { speak } from '#lib/voice.ts';
  import FlowProgress from '#lib/components/FlowProgress.svelte';
  import type { CheckResult } from '#lib/triage/types.ts';

  let {
    id,
    next,
    duration,
    step,
  }: {
    id: 'face' | 'arm';
    /** Route to go to once the check is done or skipped. */
    next: string;
    duration?: number;
    /** 1-based position in the 4-step check flow. */
    step: number;
  } = $props();

  // Arm drift needs a longer hold than the face check (QUALITY.MIN_ARM_FRAMES is higher).
  const captureMs = $derived(duration ?? (id === 'arm' ? 10000 : 5000));

  let phase = $state<'ready' | 'checking' | 'done'>('ready');

  const instruct = () => speak(t($locale, `check.${id}.instructions`), $locale);
  onMount(instruct);

  function begin() {
    phase = 'checking';
    instruct();
  }

  function complete(result: CheckResult) {
    // Store the measured score and side from the vision layer. A poor_quality or unavailable
    // result flows straight into the engine, which can only make the outcome MORE cautious.
    setCheck(result);
    phase = 'done';
    setTimeout(() => goto(next), 1000);
  }

  function skip() {
    setCheck(unavailableCheck(id));
    goto(next);
  }
</script>

<div class="check">
  <FlowProgress locale={$locale} {step} />
  <h1>{t($locale, `check.${id}.title`)}</h1>
  <p class="instructions">{t($locale, `check.${id}.instructions`)}</p>

  <CameraView
    guide={id}
    locale={$locale}
    active={phase === 'checking'}
    duration={captureMs}
    coaching={t($locale, phase === 'checking' ? 'check.coach.holdStill' : 'check.coach.faceCamera')}
    oncomplete={complete}
  />

  <p class="status" aria-live="polite">
    {#if phase === 'checking'}
      {t($locale, 'check.common.checking')}
    {:else if phase === 'done'}
      {t($locale, 'check.common.complete')}
    {/if}
  </p>

  <div class="actions">
    {#if phase === 'ready'}
      <button type="button" class="button primary" onclick={begin}>
        {t($locale, `check.${id}.start`)}
      </button>
    {/if}
    {#if phase !== 'done'}
      <button type="button" class="button secondary" onclick={skip}>
        {t($locale, 'check.common.skip')}
      </button>
    {/if}
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
  .status {
    margin: 0;
  }

  .status {
    font-weight: 700;
    min-height: 1.5em;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: auto;
  }
</style>
