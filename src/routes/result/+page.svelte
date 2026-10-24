<!--
  Result screen. Reads the in-memory session (checks, BE-FAST, caregiver reports), runs the pure
  triage engine, and renders the copy that resultCopy() returns plus a per-check summary.
  Escalate-only: there is no reassuring state or color here. CALL_911_NOW is red with a large
  Call 911 button; CANNOT_RULE_OUT and RETRY_CAPTURE are amber and keep the call-911 line.
  The 911 control in +layout.svelte is always present (.kiro/steering/safety.md §1-2).
  Nothing here is saved or sent anywhere (§4).
-->
<script lang="ts">
  import { t } from '#lib/i18n/index.ts';
  import { triage } from '#lib/triage/engine.ts';
  import { resultCopy } from '#lib/triage/copy.ts';
  import type { CheckId, TriageResult } from '#lib/triage/types.ts';
  import { locale, checks, beFast, caregiverReports, symptomOnset } from '#lib/stores/session.ts';
  import { speak } from '#lib/voice.ts';

  // Baseline comparison is not recorded in this flow yet.
  const result = $derived(
    triage({
      checks: $checks,
      beFast: $beFast,
      caregiverReports: $caregiverReports,
      baseline: null,
    })
  );
  const copy = $derived(resultCopy(result, $locale));
  const tone = $derived(copy.colorToken); // 'act' | 'caution'
  const statusKey = $derived(
    result.state === 'CALL_911_NOW' ? 'act' : result.state === 'RETRY_CAPTURE' ? 'retry' : 'caution'
  );

  // Read the headline aloud when it appears or the language changes.
  $effect(() => {
    speak(copy.title, $locale);
  });

  /** One row per check in the flow: face, arms, voice. */
  type Tag = 'flagged' | 'retry' | 'notChecked' | 'notFlagged';
  function tagFor(id: CheckId, r: TriageResult): Tag {
    if (r.reasons.some((x) => x.kind === 'check_flagged' && x.check === id)) return 'flagged';
    const status = $checks[id].status;
    if (status === 'poor_quality' || (status === 'ok' && $checks[id].score === null)) return 'retry';
    if (status === 'unavailable') return 'notChecked';
    return 'notFlagged';
  }
  const rows = $derived((['face', 'arm', 'speech'] as const).map((id) => ({ id, tag: tagFor(id, result) })));

  const ROUTE: Record<CheckId, string> = { face: '/check/face', speech: '/check/speech', arm: '/check/arm' };

  const clock = (ms: number) =>
    new Intl.DateTimeFormat($locale, { hour: 'numeric', minute: '2-digit' }).format(new Date(ms));
  const checkedAt = Date.now();
</script>

<div class="split result">
  <section>
    <p class="status-line {tone}">
      <span class="dot {tone}"></span>
      {t($locale, `result.status.${statusKey}`)}
    </p>

    <h1 aria-live="assertive"><em class={tone}>{copy.title}</em></h1>

    {#each copy.body as line (line)}
      <p class="sub">{line}</p>
    {/each}

    <p class="sub">
      {#if $symptomOnset}
        {t($locale, 'result.timeNoticed')}:
        <strong>{t($locale, `home.timeNoticed.${$symptomOnset.choice}`)} · {clock($symptomOnset.recordedAt)}</strong>
      {:else}
        {t($locale, 'result.checkedAt')} <strong>{clock(checkedAt)}</strong>
      {/if}
    </p>

    <div class="actions">
      {#if result.state === 'CALL_911_NOW'}
        <a href="tel:911" class="btn btn-act btn-wide call-big">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
          </svg>
          {t($locale, 'nav.call911')}
        </a>
      {:else}
        {#each copy.actions as action (action)}
          <p class="small action">{action}</p>
        {/each}
        {#if result.state === 'RETRY_CAPTURE'}
          {#each result.retryChecks as id (id)}
            <a href={ROUTE[id]} class="btn btn-primary btn-wide">
              {t($locale, 'result.retryCheck', { check: t($locale, `result.check.${id}`) })}
            </a>
          {/each}
        {:else}
          <a href="/check/face" class="btn btn-primary btn-wide">{t($locale, 'result.checkAgain')}</a>
          <a href="/check/befast" class="btn btn-outline btn-wide">{t($locale, 'result.moreQuestions')}</a>
        {/if}
        <a href="tel:911" class="btn btn-911-outline btn-wide">{t($locale, 'nav.call911')}</a>
      {/if}
    </div>
  </section>

  <section>
    {#each rows as row (row.id)}
      <div class="panel finding">
        <span class="name">{t($locale, `result.finding.${row.id}`)}</span>
        <span class="tag {row.tag}">{t($locale, `result.tag.${row.tag}`)}</span>
      </div>
    {/each}
    <p class="small note">{t($locale, 'result.notDiagnosis')}</p>
    <a href="/" class="btn btn-outline btn-small close">{t($locale, 'result.close')}</a>
  </section>
</div>

<style>
  .result {
    align-items: flex-start;
  }

  .status-line {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 0 18px;
    font-size: 1.15rem;
  }

  .status-line.act {
    color: var(--color-act-soft);
  }

  .status-line.caution {
    color: var(--color-caution-soft);
  }

  .actions {
    flex-direction: column;
  }

  .call-big {
    min-height: 92px;
    border-radius: 46px;
    font-size: 1.5rem;
  }

  .action {
    margin: 0;
  }

  .finding {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 26px 28px;
    border-radius: 24px;
  }

  .finding + .finding {
    margin-top: 12px;
  }

  .name {
    font-family: var(--serif);
    font-size: 2rem;
  }

  .tag {
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 1rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .tag.flagged {
    background: var(--color-act-bg);
    color: var(--color-act-soft);
  }

  .tag.retry {
    background: var(--color-caution-bg);
    color: var(--color-caution-soft);
  }

  /* Not flagged / not checked stay neutral: never a reassuring color. */
  .tag.notFlagged,
  .tag.notChecked {
    background: var(--color-bg);
    color: var(--color-muted);
    border: 1px solid var(--color-line);
  }

  .note {
    margin: 20px 0 0;
  }

  .close {
    margin-top: 24px;
  }
</style>
