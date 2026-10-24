import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';

// SvelteKit 3: configuration is passed to the plugin (svelte.config.js is no longer supported).
export default defineConfig({
  plugins: [
    sveltekit({
      preprocess: vitePreprocess(),
      // Fully static, client-only app (no backend). See .kiro/steering/tech.md.
      // Prerender every route; 200.html is the SPA fallback (does not overwrite the prerendered home).
      adapter: adapter({ fallback: '200.html' })
    })
  ],
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node'
  }
});
