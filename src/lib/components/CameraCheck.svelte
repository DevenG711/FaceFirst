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
    oncapture,
    onskip,
    onback,
  }: {
    id: 'face' | 'arm';
    /** Route to go to once the check is done or skipped. */
    next: string;
    /** Route for the Back button. */
    back?: string;
    duration?: number;
    /** 1-based position in the check flow; omit for a check outside the main flow. */
    step?: number;
    /**
     * Baseline enrollment: receive the measured result instead of storing it as this session's check
     * and navigating to `next`. The session check results are left untouched.
     */
    oncapture?: (result: CheckResult) => void;
    /** Replaces the default skip (record `unavailable` and go to `next`). */
    onskip?: () => void;
    /** Replaces the Back link with a button (for multi-step screens on one route). */
    onback?: () => void;
  } = $props();

  // Arm drift needs a longer hold than the face check (QUALITY.MIN_ARM_FRAMES is higher).
  const captureMs = $derived(duration ?? (id === 'arm' ? 10000 : 5000));

  let phase = $state<'ready' | 'checking' | 'done'>('ready');

  const instruct = () => speak(t($locale, `check.${id}.instructions`), $locale);
  onMount(instruct);

  // Outcome of the pre-capture gate (arm: framed; face: smiling), or null while still waiting.
  let gate = $state<'fit' | 'timeout' | null>(null);

  // Line shown on the camera view once the timer runs. While waiting, CameraView shows its own hint.
  // Face: "Good, keep smiling" once they smiled; if they never did, keep asking for the smile.
  const captureCoachKey = $derived(
    gate === 'timeout' ? `check.coach.${id}.${id === 'face' ? 'smile' : 'ready'}` : `check.coach.${id}.ready`
  );
  const coaching = $derived(
    phase === 'done'
      ? t($locale, 'check.common.complete')
      : phase === 'checking'
      ? t($locale, captureCoachKey)
      : t($locale, id === 'face' ? 'check.coach.face.smile' : 'check.coach.faceCamera')
  );

  function begin() {
    phase = 'checking';
    gate = null;
    instruct();
  }

  function fitted(outcome: 'fit' | 'timeout') {
    gate = outcome;
    speak(t($locale, captureCoachKey), $locale);
  }

  function complete(result: CheckResult) {
    // Store the measured score and side from the vision layer. A poor_quality or unavailable
    // result flows straight into the engine, which can only make the outcome MORE cautious.
    if (import.meta.env.DEV) logMeasured(result);
    phase = 'done';
    if (oncapture) {
      setTimeout(() => oncapture(result), 1000);
      return;
    }
    setCheck(result);
    setTimeout(() => goto(next), 1000);
  }

  // Dev-only: print what the camera actually measured for this check, so you can see what the
  // vision layer found from the real media. Never shown in production builds.
  function logMeasured(result: CheckResult) {
    const measures =
      result.status === 'ok'
        ? result.id === 'face'
          ? 'facial asymmetry (higher = more droop)'
          : 'arm drift (higher = more drift)'
        : '—';
    const read =
      result.status === 'ok'
        ? result.id === 'face'
          ? result.side
            ? `droop on the ${result.side} side of the face`
            : 'no clear droop side'
          : result.side
            ? `drift in the ${result.side} arm`
            : 'no clear drift side'
        : result.status === 'poor_quality'
          ? 'could not measure cleanly — will ask for a retry'
          : 'camera/model unavailable — treated cautiously';
    // eslint-disable-next-line no-console
    console.log(
      `%c[FaceFirst] ${result.id} check — ${result.status}`,
      'font-weight:700',
      {
        check: result.id,
        status: result.status,
        score: result.score,
        signed: result.signed ?? null, // anatomical: + = left weaker, − = right weaker
        baselineCapture: Boolean(oncapture),
        measures,
        side: result.side,
        reading: read,
      }
    );
    // eslint-disable-next-line no-console
    console.table([{ check: result.id, status: result.status, score: result.score, side: result.side }]);
  }

  function skip() {
    if (onskip) return onskip();
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
    {coaching}
    oncomplete={complete}
    onfit={fitted}
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
  {#if onback}
    <button type="button" class="btn btn-outline" onclick={onback}>{t($locale, 'check.common.back')}</button>
  {:else}
    <a href={back} class="btn btn-outline">{t($locale, 'check.common.back')}</a>
  {/if}
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
