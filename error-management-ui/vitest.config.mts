import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Real-Postgres integration tests (tests/**/*.test.ts) — no React Testing Library/jsdom, since
// nothing here renders a component; every test exercises server-side Node logic (service
// functions, an API route handler, RBAC guards) directly, invoked the same way Server Actions
// and route handlers invoke them in the running app. See tests/README.md for the DATABASE_URL
// this suite requires and the test-isolation convention every test file follows.
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
    setupFiles: ['./tests/setup.ts'],
    // Real Postgres round-trips (including a deliberate concurrency test in
    // tests/services/errorCodes.test.ts) are slower than in-memory/mocked tests.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: [
        'src/lib/services/**',
        'src/lib/auth/rbac.ts',
        'src/app/api/v1/lookup/route.ts',
      ],
    },
  },
});
