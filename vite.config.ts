import { defineConfig } from 'vitest/config';

// Served from https://catalystneuro.github.io/goatcounter-dashboard/ on GitHub Pages.
// Override with VITE_BASE=/ for a root deployment or local preview.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/goatcounter-dashboard/',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
