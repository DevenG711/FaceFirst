<!--
  Result screen. Reads the in-memory session (checks, BE-FAST, caregiver reports, baseline),
  runs the pure triage engine, and renders ONLY the copy that resultCopy() returns.
  Escalate-only: the outcome never clears a person, and the 911 control (in +layout.svelte) is
  always present (.kiro/steering/safety.md §1-2). Nothing here is saved or sent anywhere (§4).
-->
<script lang="ts">
  import { t } from '#lib/i18n/index.ts';
  import { triage } from '#lib/triage/engine.ts';
  import { resultCopy } from '#lib/triage/copy.ts';
  import {
    locale,
    checks,
    beFast,
    caregiverReports,
    symptomOnset,
  } from '#lib/stores/session.ts';
  import { speak } from '#lib/voice.ts';

  // Baseline comparison is an in-memory feature; none is recorded in this flow yet.
  const result = $derived(
    triage({
      checks: $checks,
      beFast: $beFast,
      caregiverReports: $caregiverReports,
      baseline: null,
    })
  );

  const copy = $derived(resultCopy(result, $locale));

  // Read the headline aloud when it appears or the language changes.
  $effect(() => {
    speak(copy.title, $locale);
  });

  // Localized clock time for "last known well", shown to help the EMS handoff.
  const onsetTime = $derived(
    $symptomOnset
      ? new Intl.DateTimeFormat($locale, { hour: 'numeric', minute: '2-digit' }).format(
          new Date($symptomOnset.recordedAt)
        )
      : null
  );
</script>

<div class="result {copy.colorToken}">
  <h1 aria-live="assertive">{copy.title}</h1>

  {#each copy.body as line (line)}
    <p class="body">{line}</p>
  {/each}

  {#each copy.actions as action (action)}
    <p class="action">{action}</p>
  {/each}

  {#if $symptomOnset}
    <section class="onset">
      <h2>{t($locale, 'home.timeNoticed.label')}</h2>
      <p>
        {t($locale, `home.timeNoticed.${$symptomOnset.choice}`)}{#if onsetTime}
          &nbsp;({onsetTime}){/if}
      </p>
    </section>
  {/if}

  <nav class="actions">
    <a class="button secondary" href="/check/face">{t($locale, 'home.start')}</a>
  </nav>
</div>

<style>
  .result {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-height: calc(100dvh - var(--tap-min) - 2rem);
    padding: 1rem;
    border-radius: 12px;
    border: 4px solid var(--color-fg);
  }

  /* 'act' and 'caution' are the only tokens; no reassuring/pass color is allowed. */
  .result.act {
    border-color: var(--color-act);
    background: var(--color-act);
    color: var(--color-act-text);
  }

  .result.caution {
    border-color: var(--color-caution);
    background: var(--color-caution);
    color: var(--color-caution-text);
  }

  h1 {
    margin: 0;
    font-size: 48px; /* design.md: result headline >= 48px, bold */
    line-height: 1.1;
    font-weight: 800;
  }

  h2 {
    margin: 0 0 0.25rem;
    font-size: 1.1rem;
  }

  .body,
  .action,
  .onset p {
    margin: 0;
    font-size: 1.25rem;
    line-height: 1.5;
  }

  .action {
    font-weight: 700;
  }

  .onset {
    margin-top: 0.5rem;
    padding-top: 0.75rem;
    border-top: 2px solid currentColor;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: auto;
  }
</style>
