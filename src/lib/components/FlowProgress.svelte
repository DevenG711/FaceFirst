<!--
  Step indicator for the check flow (face -> arms -> voice). Accent bars only, never green
  (.kiro/steering/design.md). Purely informational; it never blocks or gates calling 911.
-->
<script lang="ts">
  import { t, type Locale } from '#lib/i18n/index.ts';

  let {
    locale,
    step,
    total = 3,
  }: {
    locale: Locale;
    /** 1-based index of the current step. */
    step: number;
    total?: number;
  } = $props();
</script>

<div class="flow-progress">
  <span class="label">{t(locale, 'check.common.step', { n: step, total })}</span>
  <span class="bars" aria-hidden="true">
    {#each Array(total) as _, i (i)}
      <span class:on={i < step}></span>
    {/each}
  </span>
</div>

<style>
  .flow-progress {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;
  }

  .label {
    font-size: 1rem;
    color: var(--color-muted);
  }

  .bars {
    display: flex;
    gap: 8px;
  }

  .bars span {
    width: 48px;
    height: 6px;
    border-radius: 3px;
    background: var(--color-line);
  }

  .bars span.on {
    background: var(--color-accent);
  }
</style>
