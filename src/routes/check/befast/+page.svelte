<!--
  BE-FAST questions, one at a time. Optional and secondary: only reached when the sensor checks
  found nothing (see /check/speech). Skipping keeps any answers already given and still lands on
  a real triage result, never a reassuring one. "Not sure" is stored as 'unsure', which the
  triage engine does not treat as 'yes' (see .kiro/specs/triage-engine/design.md).
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from '#lib/i18n/index.ts';
  import { BEFAST_QUESTIONS, beFast, locale, setBeFastAnswer } from '#lib/stores/session.ts';
  import { speak } from '#lib/voice.ts';
  import FlowProgress from '#lib/components/FlowProgress.svelte';
  import type { Answer } from '#lib/triage/types.ts';

  const NEXT = '/result';
  const ANSWERS: readonly Answer[] = ['yes', 'no', 'unsure'];

  let index = $state(0);
  let heading: HTMLHeadingElement | undefined = $state();
  const question = $derived(BEFAST_QUESTIONS[index] ?? 'balance');

  // Read each question aloud as it appears.
  $effect(() => {
    speak(t($locale, `check.befast.${question}`), $locale);
  });

  async function show(i: number) {
    index = i;
    await tick();
    heading?.focus(); // so screen readers hear the new question
  }

  function answer(a: Answer) {
    setBeFastAnswer(question, a);
    if (index + 1 < BEFAST_QUESTIONS.length) show(index + 1);
    else goto(NEXT);
  }
</script>

<div class="check">
  <FlowProgress locale={$locale} step={4} />
  <h1>{t($locale, 'check.befast.title')}</h1>
  <p class="intro">{t($locale, 'check.befast.intro')}</p>

  <div class="progress">
    <p>
      {t($locale, 'check.befast.progress', { n: index + 1, total: BEFAST_QUESTIONS.length })}
    </p>
    <ol aria-hidden="true">
      {#each BEFAST_QUESTIONS as q, i (q)}
        <li class:current={i === index} class:answered={i < index}></li>
      {/each}
    </ol>
  </div>

  <h2 bind:this={heading} tabindex="-1">{t($locale, `check.befast.${question}`)}</h2>

  <div class="answers">
    {#each ANSWERS as a (a)}
      <button
        type="button"
        class="button {a === 'yes' ? 'primary' : 'secondary'} {a}"
        aria-pressed={$beFast[question] === a}
        onclick={() => answer(a)}
      >
        {t($locale, `check.befast.answer.${a}`)}
      </button>
    {/each}
    {#if index > 0}
      <button type="button" class="back" onclick={() => show(index - 1)}>
        {t($locale, 'check.befast.back')}
      </button>
    {/if}
    <button type="button" class="button secondary skip" onclick={() => goto(NEXT)}>
      {t($locale, 'check.befast.skip')}
    </button>
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
  h2,
  .intro,
  .progress p {
    margin: 0;
  }

  .skip {
    margin-top: 0.75rem;
  }

  /* Neutral progress dots, never green. */
  .progress ol {
    display: flex;
    gap: 0.5rem;
    margin: 0.5rem 0 0;
    padding: 0;
    list-style: none;
  }

  .progress li {
    flex: 1;
    height: 8px;
    border-radius: 4px;
    background: #e0e0e0;
  }

  .progress li.answered {
    background: #555555;
  }

  .progress li.current {
    background: var(--color-fg);
  }

  .answers {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: auto;
  }

  /* "Not sure" stands apart from "No" without using color. */
  .unsure {
    border-style: dashed;
    border-width: 3px;
  }

  .back {
    align-self: flex-start;
    padding: 0 1rem;
    border: 0;
    background: none;
    color: var(--color-fg);
    text-decoration: underline;
    cursor: pointer;
  }
</style>
