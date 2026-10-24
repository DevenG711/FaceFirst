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
    back = '/',
    duration,
    step,
  }: {
    id: 'face' | 'arm';
    /** Route to go to once the check is done or skipped. */
    next: string;
    /** Route for the Back button. */
    back?: string;
    duration?: number;
    /** 1-based position in the check flow; omit for a check outside the main flow. */
    step?: number;
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

{#if step}
  <FlowProgress locale={$locale} {step} />
{/if}

<h1>{t($locale, `check.${id}.headline`)} <em>{t($locale, `check.${id}.headlineEm`)}</em></h1>
<p class="sub">{t($locale, `check.${id}.instructions`)}</p>

<div class="camera">
  <CameraView
    guide={id}
    locale={$locale}
    active={phase === 'checking'}
    duration={captureMs}
    coaching={phase === 'done'
      ? t($locale, 'check.common.complete')
      : t($locale, phase === 'checking' ? 'check.coach.holdStill' : 'check.coach.faceCamera')}
    oncomplete={complete}
  />
</div>

<p class="sr-only" aria-live="polite">
  {#if phase === 'checking'}
    {t($locale, 'check.common.checking')}
  {:else if phase === 'done'}
    {t($locale, 'check.common.complete')}
  {/if}
</p>

<div class="actions between">
  <a href={back} class="btn btn-outline">{t($locale, 'check.common.back')}</a>
  {#if phase === 'ready'}
    <button type="button" class="btn btn-primary" onclick={begin}>
      {t($locale, `check.${id}.start`)}
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" />
      </svg>
    </button>
  {/if}
</div>

{#if phase !== 'done'}
  <button type="button" class="skip" onclick={skip}>{t($locale, 'check.common.skip')}</button>
{/if}

<style>
  .camera {
    margin-top: 36px;
  }

  .skip {
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
</style>
