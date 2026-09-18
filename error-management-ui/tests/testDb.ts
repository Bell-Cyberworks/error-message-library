import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';

// Shared helper for every file under tests/. Re-exports the app's own Prisma singleton
// (src/lib/db/prisma.ts) — tests run against a real Postgres database, never a mock, and
// must never instantiate a second PrismaClient. See tests/README.md for the required
// DATABASE_URL and the test-isolation convention this file supports:
//
//   - No per-test transactional rollback (Prisma doesn't make that easy without extra
//     tooling this project doesn't have). Instead, every row a test creates uses a
//     collision-safe unique name/email built with uniqueSuffix() below, so parallel test
//     files and repeated runs never collide on this schema's unique constraints
//     (Application.name, Environment @@unique([applicationId, name]), User.email, ...).
//   - Each test file's own afterAll/afterEach deletes everything it created, relying on
//     schema.prisma's onDelete: Cascade where applicable (deleting an Application cascades
//     to its Environments/ErrorMessages/ErrorContents/ApplicationAdminAssignments) so
//     cleanup is often a single delete of the top-level row.
export { prisma };

/** A short, collision-safe suffix for test-created names/emails, e.g.
 *  `Test App ${uniqueSuffix()}` or `test-${uniqueSuffix()}@example.com`. */
export function uniqueSuffix(): string {
  return randomUUID().slice(0, 8);
}
