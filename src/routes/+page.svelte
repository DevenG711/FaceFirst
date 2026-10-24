<!--
  Home. Keep the disclaimer (.kiro/steering/safety.md §3). Nothing here may block or delay
  calling 911: the symptom-time question is optional and Start is always enabled.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { t, LOCALES, type Locale } from '#lib/i18n/index.ts';
  import {
    locale,
    symptomOnset,
    SYMPTOM_ONSET_OPTIONS,
    type SymptomOnset,
  } from '#lib/stores/session.ts';
  import { speak } from '#lib/voice.ts';

  const welcome = (l: Locale) => speak(t(l, 'home.voice.welcome'), l);

  // Browsers may stay silent until the first tap; picking a language speaks again.
  onMount(() => welcome($locale));

  function chooseLocale(l: Locale) {
    locale.set(l);
    welcome(l);
  }

  function chooseOnset(choice: SymptomOnset) {
    symptomOnset.set({ choice, recordedAt: Date.now() });
  }
</script>

<div class="home">
  <header>
    <h1>{t($locale, 'home.title')}</h1>
    <p class="tagline">{t($locale, 'home.tagline')}</p>
  </header>

  <fieldset class="language">
    <legend>{t($locale, 'home.language')}</legend>
    {#each LOCALES as l (l)}
      <button
        type="button"
        lang={l}
        aria-pressed={$locale === l}
        onclick={() => chooseLocale(l)}
      >
        {t(l, 'home.languageName')}
      </button>
    {/each}
  </fieldset>

  <fieldset class="onset">
    <legend>{t($locale, 'home.timeNoticed.label')}</legend>
    <p class="hint">{t($locale, 'home.timeNoticed.hint')}</p>
    {#each SYMPTOM_ONSET_OPTIONS as option (option)}
      <label class="option">
        <input
          type="radio"
          name="onset"
          value={option}
          checked={$symptomOnset?.choice === option}
          onchange={() => chooseOnset(option)}
        />
        {t($locale, `home.timeNoticed.${option}`)}
      </label>
    {/each}
  </fieldset>

  <nav class="actions">
    <a class="button primary" href="/check/face">{t($locale, 'home.start')}</a>
    <a class="button secondary" href="/baseline">{t($locale, 'home.baseline')}</a>
  </nav>

  <p class="disclaimer">{t($locale, 'home.disclaimer')}</p>
</div>

<style>
  /* Fill the screen so the actions sit in the bottom half on phones (one-handed use). */
  .home {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    min-height: calc(100dvh - var(--tap-min) - 2rem);
  }

  h1 {
    margin: 0;
  }

  .tagline {
    margin: 0.25rem 0 0;
  }

  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
  }

  legend {
    font-weight: 700;
    margin-bottom: 0.5rem;
  }

  .language {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .language legend {
    width: 100%;
  }

  .language button {
    flex: 1 1 0;
    min-height: var(--tap-min);
    padding: 0 0.75rem;
    border: 2px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-surface);
    color: var(--color-fg);
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease;
  }

  .language button[aria-pressed='true'] {
    background: var(--color-fg);
    color: var(--color-bg);
    border-color: var(--color-fg);
    font-weight: 700;
  }

  .hint {
    margin: 0 0 0.5rem;
    color: var(--color-muted);
  }

  .option {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: var(--tap-min);
    padding: 0.5rem 1rem;
    margin-bottom: 0.5rem;
    border: 2px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-surface);
    cursor: pointer;
    transition: border-color 0.12s ease, box-shadow 0.12s ease;
  }

  .option:has(input:checked) {
    border-color: var(--color-focus);
    box-shadow: inset 0 0 0 2px var(--color-focus);
    background: var(--color-bg);
    font-weight: 700;
  }

  .option input {
    width: 1.5rem;
    height: 1.5rem;
    margin: 0;
    accent-color: var(--color-focus);
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: auto;
  }

  .disclaimer {
    margin: 0;
  }
</style>
