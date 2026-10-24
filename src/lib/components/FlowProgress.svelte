<!--
  Flow progress for the check sequence (face -> arm -> speech -> questions). Neutral dots only,
  never green (.kiro/steering/design.md): a filled dot means "done", the current one is outlined,
  future ones are faint. Purely informational; it never blocks or gates calling 911.
-->
<script lang="ts">
  import { t, type Locale } from '#lib/i18n/index.ts';

  let {
    locale,
    step,
    total = 4,
  }: {
    locale: Locale;
    /** 1-based index of the current step. */
    step: number;
    total?: number;
  } = $props();
</script>

<div class="flow-progress">
  <p class="label">{t(locale, 'check.common.step', { n: step, total })}</p>
  <ol aria-hidden="true">
    {#each Array(total) as _, i (i)}
      <li class:done={i < step - 1} class:current={i === step - 1}></li>
    {/each}
  </ol>
</div>

<style>
  .flow-progress {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .label {
    margin: 0;
    font-weight: 700;
  }

  ol {
    display: flex;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  li {
    flex: 1;
    height: 8px;
    border-radius: 4px;
    background: #e0e0e0; /* future step */
  }

  li.done {
    background: #555555; /* completed; neutral gray, never green */
  }

  li.current {
    background: var(--color-fg);
  }
</style>
