<!--
  Baseline enrollment. A healthy recording used later to compare a loved one against their own
  normal face/arm movement. This screen explains the feature and keeps the 911 control present
  (+layout.svelte). Nothing is uploaded; recordings stay on the device (.kiro/steering/safety.md §4).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '#lib/i18n/index.ts';
  import { locale } from '#lib/stores/session.ts';
  import { speak } from '#lib/voice.ts';

  onMount(() => speak(t($locale, 'baseline.voice'), $locale));
</script>

<div class="baseline">
  <header>
    <h1>{t($locale, 'baseline.title')}</h1>
  </header>

  <p class="intro">{t($locale, 'baseline.intro')}</p>
  <p class="note">{t($locale, 'baseline.note')}</p>

  <nav class="actions">
    <a class="button primary" href="/check/face">{t($locale, 'baseline.start')}</a>
    <a class="button secondary" href="/">{t($locale, 'baseline.back')}</a>
  </nav>
</div>

<style>
  .baseline {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    min-height: calc(100dvh - var(--tap-min) - 2rem);
  }

  h1 {
    margin: 0;
  }

  .intro,
  .note {
    margin: 0;
  }

  .note {
    font-weight: 700;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: auto;
  }
</style>
