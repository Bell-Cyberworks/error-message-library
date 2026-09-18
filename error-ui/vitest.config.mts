import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Pure-logic unit tests (tests/**/*.test.ts) — no React Testing Library/jsdom. Everything
// exercised here is server-side Node logic extracted into src/lib/lookup.ts; this project has
// no browser automation tool available, so full page-level/Server-Component rendering is out
// of scope. See tests/README.md.
export default defineConfig({
  resolve: {
    alias: {
      // Mirrors tsconfig.json's "@/*" -> "./src/*" path alias — vitest/vite does not read
      // tsconfig "paths" automatically, so this must be kept in sync by hand if that alias
      // ever changes.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
