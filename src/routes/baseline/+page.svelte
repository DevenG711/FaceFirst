<!--
  Baseline enrollment. A short recording on a typical day, used later to compare a loved one
  against their own usual face/arm movement. It never implies the person is well; it is only a
  comparison reference, and it can only make later checks MORE sensitive (lib/triage/engine.ts).
  The 911 control stays present (+layout.svelte). Only a few numbers are saved, locally in
  IndexedDB; no video or image is kept or uploaded (.kiro/steering/safety.md §4).

  Steps on this one route: intro -> face -> arm -> saved. Each capture reuses CameraCheck (same
  smile gate and arm framing as the real check, so later comparisons are like for like) but hands
  the result back here instead of storing it as this session's check.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '#lib/i18n/index.ts';
  import FaceGuide from '#lib/components/FaceGuide.svelte';
  import CameraCheck from '#lib/components/CameraCheck.svelte';
  import FlowProgress from '#lib/components/FlowProgress.svelte';
  import { locale, savedBaseline, useBaseline } from '#lib/stores/session.ts';
  import {
    BASELINE_CHECKS,
    baselineFromResults,
    clearBaseline,
    entryFromResult,
    saveBaseline,
    type BaselineCheckId,
  } from '#lib/storage/baselines.ts';
  import type { CheckResult } from '#lib/triage/types.ts';
  import { speak } from '#lib/voice.ts';

  type Step = 'intro' | 'face' | 'arm' | 'saving' | 'saved';
  let step = $state<Step>('intro');
  /** Which capture failed quality and needs a retry, if any. */
  let retry = $state<BaselineCheckId | null>(null);
  /** Bumped to remount CameraCheck for a fresh attempt. */
  let attempt = $state(0);
  let faceResult = $state<CheckResult | null>(null);
  let saveFailed = $state(false);
  let deleted = $state(false);

  onMount(() => speak(t($locale, 'baseline.voice'), $locale));

  const day = (ms: number) => new Intl.DateTimeFormat($locale, { dateStyle: 'medium' }).format(new Date(ms));
  const parts = (b: NonNullable<typeof $savedBaseline>) =>
    BASELINE_CHECKS.filter((id) => b.checks[id])
      .map((id) => t($locale, `baseline.part.${id}`))
      .join(', ');

  function begin() {
    faceResult = null;
    retry = null;
    saveFailed = false;
    deleted = false;
    attempt++;
    step = 'face';
  }

  function onFace(result: CheckResult) {
    if (!entryFromResult(result)) {
      retry = 'face';
      speak(t($locale, 'baseline.retry.face'), $locale);
      return;
    }
    faceResult = result;
    retry = null;
    attempt++;
    step = 'arm';
  }

  function onArm(result: CheckResult) {
    if (!entryFromResult(result)) {
      retry = 'arm';
      speak(t($locale, 'baseline.retry.arm'), $locale);
      return;
    }
    void save([faceResult!, result]);
  }

  async function save(results: CheckResult[]) {
    step = 'saving';
    retry = null;
    saveFailed = false;
    const baseline = baselineFromResults(results, Date.now());
    try {
      if (!baseline) throw new Error('no usable readings');
      await saveBaseline(baseline);
      savedBaseline.set(baseline);
      useBaseline.set(true);
      step = 'saved';
      speak(t($locale, 'baseline.saved.voice'), $locale);
    } catch {
      saveFailed = true;
      step = 'intro';
    }
  }

  function tryAgain() {
    retry = null;
    attempt++;
  }

  async function remove() {
    try {
      await clearBaseline();
    } finally {
      savedBaseline.set(null);
      deleted = true;
    }
  }
</script>

{#if step === 'face' || step === 'arm'}
  <FlowProgress locale={$locale} step={step === 'face' ? 1 : 2} total={2} />
  {#if retry === step}
    <h1>{t($locale, 'baseline.title')}</h1>
    <p class="sub" role="alert">{t($locale, `baseline.retry.${step}`)}</p>
    <div class="actions between">
      <button type="button" class="btn btn-outline" onclick={() => (step = 'intro')}>
        {t($locale, 'check.common.back')}
      </button>
      <button type="button" class="btn btn-primary" onclick={tryAgain}>{t($locale, 'baseline.tryAgain')}</button>
    </div>
    {#if step === 'arm'}
      <button type="button" class="link" onclick={() => save([faceResult!])}>{t($locale, 'baseline.skipArm')}</button>
    {/if}
  {:else}
    {#key `${step}-${attempt}`}
      {#if step === 'face'}
        <CameraCheck id="face" next="/baseline" oncapture={onFace} onskip={() => (step = 'intro')} onback={() => (step = 'intro')} />
      {:else}
        <CameraCheck
          id="arm"
          next="/baseline"
          oncapture={onArm}
          onskip={() => save([faceResult!])}
          onback={() => {
            attempt++;
            step = 'face';
          }}
        />
      {/if}
    {/key}
  {/if}
{:else if step === 'saving'}
  <h1>{t($locale, 'baseline.title')}</h1>
  <p class="sub" aria-live="polite">{t($locale, 'baseline.saving')}</p>
{:else if step === 'saved'}
  <div class="split baseline">
    <section>
      <h1 aria-live="polite">{t($locale, 'baseline.saved.title')} <em>{t($locale, 'baseline.saved.titleEm')}</em></h1>
      <p class="sub">{t($locale, 'baseline.saved.body')}</p>
      {#if $savedBaseline}
        <p class="note">{t($locale, 'baseline.existingParts', { parts: parts($savedBaseline) })}</p>
      {/if}
      <p class="small warning">{t($locale, 'baseline.warning')}</p>
      <div class="actions between">
        <a class="btn btn-outline" href="/">{t($locale, 'baseline.home')}</a>
        <a class="btn btn-primary" href="/check/face">{t($locale, 'baseline.startCheck')}</a>
      </div>
    </section>
    <div class="panel illustration" aria-hidden="true">
      <FaceGuide />
    </div>
  </div>
{:else}
  <div class="split baseline">
    <section>
      <h1>{t($locale, 'baseline.title')}</h1>
      <p class="sub">{t($locale, 'baseline.intro')}</p>
      <p class="note">{t($locale, 'baseline.note')}</p>
      <p class="small optional">{t($locale, 'baseline.optional')}</p>
      <p class="small warning">{t($locale, 'baseline.warning')}</p>

      {#if saveFailed}
        <p class="small alert" role="alert">{t($locale, 'baseline.saveFailed')}</p>
      {/if}

      {#if $savedBaseline}
        <div class="panel existing">
          <p>{t($locale, 'baseline.existing', { date: day($savedBaseline.recordedAt) })}</p>
          <p class="small">{t($locale, 'baseline.existingParts', { parts: parts($savedBaseline) })}</p>
          <button type="button" class="btn btn-outline btn-small" onclick={remove}>{t($locale, 'baseline.delete')}</button>
        </div>
      {:else if deleted}
        <p class="small" aria-live="polite">{t($locale, 'baseline.deleted')}</p>
      {/if}

      <div class="actions between">
        <a class="btn btn-outline" href="/">{t($locale, 'check.common.back')}</a>
        <button type="button" class="btn btn-primary" onclick={begin}>
          {$savedBaseline ? t($locale, 'baseline.recordAgain') : t($locale, 'baseline.start')}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </section>

    <div class="panel illustration" aria-hidden="true">
      <FaceGuide />
    </div>
  </div>
{/if}

<style>
  .note {
    margin: 20px 0 0;
    color: var(--color-accent);
  }

  .optional {
    margin: 16px 0 0;
  }

  .warning {
    margin: 16px 0 0;
    color: var(--color-caution-soft);
  }

  .alert {
    margin: 16px 0 0;
    color: var(--color-act-soft);
  }

  .existing {
    margin-top: 24px;
    padding: 20px 24px;
  }

  .existing p {
    margin: 0 0 8px;
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

  .illustration {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 460px;
  }

  @media (max-width: 900px) {
    .illustration {
      display: none;
    }
  }
</style>
