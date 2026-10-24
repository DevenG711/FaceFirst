<!--
  Root layout. Call911Button MUST stay the first rendered element (first in tab order); it sits
  at the right of a sticky header on every screen (.kiro/steering/safety.md §2).
-->
<script lang="ts">
  import '../app.css';
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';
  import Call911Button from '#lib/components/Call911Button.svelte';
  import { locale, savedBaseline } from '#lib/stores/session.ts';
  import { loadBaseline } from '#lib/storage/baselines.ts';

  let { children }: { children: Snippet } = $props();

  $effect(() => {
    document.documentElement.lang = $locale;
  });

  // DEV-ONLY: expose window.facefirst for console-driven testing. Guarded by import.meta.env.DEV so
  // it is tree-shaken out of production builds and never ships. Does not affect the 911 control or
  // any rendered element — it only attaches a console helper.
  // Load the personal baseline (local IndexedDB) once, so the result screen can compare against it.
  onMount(() => {
    loadBaseline().then((b) => savedBaseline.set(b));
  });

  onMount(async () => {
    if (import.meta.env.DEV) {
      const { installTestHarness } = await import('#lib/dev/testHarness.ts');
      installTestHarness();
    }
  });
</script>

<header>
  <div class="wrap header-row">
    <Call911Button locale={$locale} />
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
    justify-content: flex-end;
    padding-block: 16px;
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
