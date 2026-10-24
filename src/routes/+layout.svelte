<!--
  Root layout. Call911Button MUST stay the first rendered element (first in tab order); it sits
  at the right of a sticky header on every screen (.kiro/steering/safety.md §2).
-->
<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import { t } from '#lib/i18n/index.ts';
  import Call911Button from '#lib/components/Call911Button.svelte';
  import { locale } from '#lib/stores/session.ts';

  let { children }: { children: Snippet } = $props();

  $effect(() => {
    document.documentElement.lang = $locale;
  });
</script>

<header>
  <div class="wrap header-row">
    <Call911Button locale={$locale} />
    <!-- After the 911 button in the DOM (so 911 stays first in tab order), shown on the left. -->
    <a href="/" class="brand">{t($locale, 'home.title')}</a>
  </div>
</header>

<main class="wrap">
  {@render children()}
</main>

<style>
  header {
    position: sticky;
    top: 0;
    z-index: 1000;
    background: var(--color-bg);
    border-bottom: 1px solid var(--color-line);
  }

  .header-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-block: 16px;
  }

  .header-row :global(.call911) {
    order: 2;
  }

  .brand {
    order: 1;
    display: inline-flex;
    align-items: center;
    min-height: var(--tap-min);
    font-family: var(--serif);
    font-size: 1.8rem;
    font-style: italic;
    line-height: 1;
    color: var(--color-accent);
    text-decoration: none;
  }

  main {
    padding-block: 48px 64px;
    animation: screen-in 0.25s ease both;
  }

  @media (max-width: 600px) {
    main {
      padding-block: 32px 48px;
    }
  }

  /* Calm entrance; the global prefers-reduced-motion rule in app.css disables it. */
  @keyframes screen-in {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
</style>
