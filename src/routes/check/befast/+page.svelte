<!--
  BE-FAST questions, one at a time. Optional and secondary: offered from the amber result screen
  when the face, arm and voice checks found nothing. Skipping keeps any answers already given and lands on
  a real triage result, never a reassuring one. "Not sure" is stored as 'unsure', which the
  triage engine does not treat as 'yes' (see .kiro/specs/triage-engine/design.md).
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { t } from '#lib/i18n/index.ts';
  import { BEFAST_QUESTIONS, beFast, locale, setBeFastAnswer } from '#lib/stores/session.ts';
  import { speak } from '#lib/voice.ts';
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
  <h1>{t($locale, 'check.befast.title')}</h1>
  <p class="sub">{t($locale, 'check.befast.intro')}</p>

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

  <div class="panel question">
    <h2 bind:this={heading} tabindex="-1">{t($locale, `check.befast.${question}`)}</h2>
  </div>

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
  .progress {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 36px;
  }

  .progress p {
    margin: 0;
    font-size: 1rem;
    color: var(--color-muted);
  }

  /* Accent progress bars, never a status color. */
  .progress ol {
    display: flex;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .progress li {
    width: 48px;
    height: 6px;
    border-radius: 3px;
    background: var(--color-line);
  }

  .progress li.answered,
  .progress li.current {
    background: var(--color-accent);
  }

  .question {
    margin-top: 20px;
    padding: 40px;
  }

  .question h2 {
    font-size: clamp(1.8rem, 4vw, 2.4rem);
  }

  .answers {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-top: 32px;
  }

  /* "Not sure" stands apart from "No" without using color. */
  .unsure {
    border-style: dashed;
  }

  .back,
  .skip.button {
    align-self: center;
    width: auto;
    min-height: var(--tap-min);
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
