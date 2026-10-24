<!--
  Root layout. Call911Button MUST stay the first rendered element (first in tab order).
  Scaffold placeholder; partner2 owns and may replace the rest.
-->
<script lang="ts">
  import '../app.css';
  import type { Snippet } from 'svelte';
  import Call911Button from '#lib/components/Call911Button.svelte';

  let { children }: { children: Snippet } = $props();
</script>

<Call911Button />

<main>
  {@render children()}
</main>

<style>
  main {
    max-width: 40rem;
    margin: 0 auto;
    padding: 1rem;
  }
</style>
