<!--
  Home. Keep the disclaimer (.kiro/steering/safety.md §3). Nothing here may block or delay
  calling 911: the symptom-time question is optional and Start is always enabled.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { t, LOCALES, type Locale } from '#lib/i18n/index.ts';
  import FaceGuide from '#lib/components/FaceGuide.svelte';
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

<div class="split home">
  <section>
    <h1>{t($locale, 'home.headline')} <em>{t($locale, 'home.headlineEm')}</em></h1>
    <p class="sub">{t($locale, 'home.sub')}</p>

    <div class="actions">
      <a href="/check/face" class="btn btn-primary">
        {t($locale, 'home.start')}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </a>
    </div>

    <fieldset class="chips">
      <legend>
        {t($locale, 'home.timeNoticed.label')}
        <span class="small">· {t($locale, 'home.optional')}</span>
      </legend>
      {#each SYMPTOM_ONSET_OPTIONS as option (option)}
        <label class="chip">
          <input
            type="radio"
            name="onset"
            value={option}
            checked={$symptomOnset?.choice === option}
            onchange={() => chooseOnset(option)}
          />
          <span>{t($locale, `home.timeNoticed.${option}`)}</span>
        </label>
      {/each}
    </fieldset>

    <fieldset class="chips">
      <legend>{t($locale, 'home.language')}</legend>
      {#each LOCALES as l (l)}
        <button type="button" class="chip" lang={l} aria-pressed={$locale === l} onclick={() => chooseLocale(l)}>
          {t(l, 'home.languageName')}
        </button>
      {/each}
    </fieldset>

    <a href="/baseline" class="btn btn-outline btn-small baseline">{t($locale, 'home.baseline')}</a>

    <p class="small disclaimer">{t($locale, 'home.disclaimer')}</p>
  </section>

  <div class="panel illustration" aria-hidden="true">
    <FaceGuide />
  </div>
</div>

<style>
  .home {
    align-items: flex-start;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 40px 0 0;
    padding: 0;
    border: 0;
  }

  legend {
    width: 100%;
    margin-bottom: 12px;
    font-size: 1rem;
    font-weight: 500;
  }

  .chip {
    position: relative;
    display: inline-flex;
    align-items: center;
    min-height: var(--tap-min);
    padding: 0 20px;
    border: 2px solid var(--color-line);
    border-radius: 28px;
    background: transparent;
    color: var(--color-fg);
    font-size: 1rem;
    cursor: pointer;
  }

  /* Radio inputs stay focusable and screen-reader visible; the pill is their visual. */
  .chip input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .chip:has(input:focus-visible) {
    outline: 3px solid var(--color-focus);
    outline-offset: 4px;
  }

  .chip:has(input:checked),
  .chip[aria-pressed='true'] {
    border-color: var(--color-accent);
    color: var(--color-accent);
    font-weight: 600;
  }

  .baseline {
    margin-top: 40px;
  }

  .disclaimer {
    margin: 32px 0 0;
    max-width: 36rem;
  }

  .illustration {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 460px;
    position: sticky;
    top: 120px;
  }

  @media (max-width: 900px) {
    .illustration {
      display: none;
    }
  }
</style>
