<!--
  Root layout. Call911Button MUST stay the first rendered element (first in tab order).
  Scaffold placeholder; partner2 owns and may replace the rest.
-->
<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import Call911Button from '#lib/components/Call911Button.svelte';
  import { locale } from '#lib/stores/session.ts';

  let { children }: { children: Snippet } = $props();

  $effect(() => {
    document.documentElement.lang = $locale;
  });
</script>

<Call911Button locale={$locale} />

<main>
  {@render children()}
</main>

<style>
  main {
    max-width: 40rem;
    margin: 0 auto;
    padding: 1rem 1rem 2rem;
    animation: screen-in 0.25s ease both;
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
