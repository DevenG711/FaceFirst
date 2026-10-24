<!--
  Call 911 control. Rendered once in src/routes/+layout.svelte so it is on every
  screen and first in tab order (.kiro/steering/safety.md §2). Never hide or disable it.
  Scaffold placeholder for styling; partner2 owns and may restyle (keep href="tel:911").
-->
<script lang="ts">
  import { t, DEFAULT_LOCALE, type Locale } from '#lib/i18n/index.ts';

  let { locale = DEFAULT_LOCALE }: { locale?: Locale } = $props();
</script>

<a class="call911" href="tel:911">
  <span class="glyph" aria-hidden="true">📞</span>
  <span>{t(locale, 'nav.call911')}</span>
</a>

<style>
  .call911 {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    min-height: 60px;
    min-width: 56px;
    padding: 0 1rem;
    background: var(--color-act);
    color: var(--color-act-text);
    font-weight: 800;
    font-size: 26px;
    letter-spacing: 0.01em;
    text-decoration: none;
    position: sticky;
    top: 0;
    z-index: 1000;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25);
  }

  .glyph {
    font-size: 24px;
    line-height: 1;
  }

  .call911:active {
    filter: brightness(0.94);
  }
</style>
