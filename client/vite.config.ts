import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  base: '/combat/',
  build: {
    outDir: 'dist',
  },
  server: {
    port: 4000,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
