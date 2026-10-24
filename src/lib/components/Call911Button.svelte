<!--
  Call 911 control. Rendered once in src/routes/+layout.svelte so it is on every
  screen and first in tab order (.kiro/steering/safety.md §2). Never hide or disable it.
-->
<script lang="ts">
  import { t, DEFAULT_LOCALE, type Locale } from '#lib/i18n/index.ts';

  let { locale = DEFAULT_LOCALE }: { locale?: Locale } = $props();
</script>

<a class="btn btn-911-outline btn-small call911" href="tel:911">
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2" />
  </svg>
  {t(locale, 'nav.call911')}
</a>

<style>
  .call911 {
    gap: 10px;
    font-weight: 600;
  }

  .call911 svg {
    width: 22px;
    height: 22px;
  }
</style>
