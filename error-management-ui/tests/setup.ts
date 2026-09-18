import { afterAll } from 'vitest';
import { prisma } from '@/lib/db/prisma';

// Registered via vitest.config.ts's test.setupFiles, so it re-runs once per test file (vitest
// isolates each test file's module registry by default, so each file gets its own instance of
// the src/lib/db/prisma.ts singleton and its own Postgres connection pool). Disconnecting here,
// once per file, avoids leaking open connections/handles past the end of the run.
afterAll(async () => {
  await prisma.$disconnect();
});
