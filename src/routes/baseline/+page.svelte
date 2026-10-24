<!--
  Baseline enrollment. A short recording on a typical day, used later to compare a loved one
  against their own usual face/arm movement. It never implies the person is well; it is only a
  comparison reference. The 911 control stays present (+layout.svelte). Nothing is uploaded;
  recordings stay on the device (.kiro/steering/safety.md §4).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '#lib/i18n/index.ts';
  import FaceGuide from '#lib/components/FaceGuide.svelte';
  import { locale } from '#lib/stores/session.ts';
  import { speak } from '#lib/voice.ts';

  onMount(() => speak(t($locale, 'baseline.voice'), $locale));
</script>

<div class="split baseline">
  <section>
    <h1>{t($locale, 'baseline.title')}</h1>
    <p class="sub">{t($locale, 'baseline.intro')}</p>
    <p class="note">{t($locale, 'baseline.note')}</p>

    <div class="actions between">
      <a class="btn btn-outline" href="/">{t($locale, 'check.common.back')}</a>
      <a class="btn btn-primary" href="/check/face">
        {t($locale, 'baseline.start')}
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </a>
    </div>
  </section>

  <div class="panel illustration" aria-hidden="true">
    <FaceGuide />
  </div>
</div>

<style>
  .note {
    margin: 20px 0 0;
    color: var(--color-accent);
  }

  .illustration {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 460px;
  }

  @media (max-width: 900px) {
    .illustration {
      display: none;
    }
  }
</style>
