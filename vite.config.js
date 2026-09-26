import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// The rules engine lives next to the Edge Function so the server and the
// browser run exactly the same code. `$engine` points the frontend at it.
export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      $engine: fileURLToPath(new URL('./supabase/functions/_shared/engine/index.js', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
