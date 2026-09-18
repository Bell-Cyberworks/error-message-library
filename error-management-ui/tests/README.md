# Automated tests

This test suite formalizes the scenarios that every prior `error-management-ui` PR verified
manually, with throwaway scripts run against a real Postgres instance (see `CHANGELOG.md` —
several entries call this out explicitly, e.g. the 0.2.0 entry's login-strategy fix). These
tests are the repeatable, committed version of that same verification — they run against a
real Postgres database, never a mocked Prisma client.

## Running the suite

**The test database must already exist and have every migration applied, and must be a
database you do not care about — tests create and delete real rows.** Never point this at a
database with real/development data.

```bash
# One-time setup: apply migrations to the test database.
DATABASE_URL=postgresql://eml:eml@localhost:5432/eml_test npx prisma migrate deploy

# Run the suite.
DATABASE_URL=postgresql://eml:eml@localhost:5432/eml_test npm test

# Watch mode.
DATABASE_URL=postgresql://eml:eml@localhost:5432/eml_test npm run test:watch

# With coverage (writes an HTML report; see the coverage/ dir, gitignored).
DATABASE_URL=postgresql://eml:eml@localhost:5432/eml_test npm run test:coverage
```

`DATABASE_URL` is read from the environment the exact same way `src/lib/db/prisma.ts` and
`prisma.config.ts` already read it — there is no `.env.test` file and no separate config
layer. If `DATABASE_URL` is unset or points at an unmigrated database, every test will fail
immediately with a Postgres connection/relation error, not a silent skip.

## Test isolation (no transactional rollback)

Prisma doesn't make per-test transactional rollback easy without extra tooling this project
doesn't have, so isolation instead relies on two conventions every test file follows:

1. **Collision-safe unique names.** Every row a test creates that's covered by a unique
   constraint (`Application.name`, `Environment @@unique([applicationId, name])`,
   `ErrorMessage @@unique([applicationId, code])`, `User.email`, ...) gets a short random
   suffix appended, via `tests/testDb.ts`'s `uniqueSuffix()` (`crypto.randomUUID().slice(0,
   8)`) — e.g. `Test App ${uniqueSuffix()}`, `test-${uniqueSuffix()}@example.com`. This is
   what lets parallel test files and repeated runs coexist in the same database without
   colliding.
2. **Self-cleanup.** Each test file's own `beforeAll`/`afterAll` (or `afterEach`, where that's
   cleaner) deletes everything it created. Deleting a top-level `Application` row is usually
   sufficient — `prisma/schema.prisma`'s `onDelete: Cascade` relations mean it cascades to
   that Application's `Environment`, `ErrorMessage`, `ErrorContent`, and
   `ApplicationAdminAssignment` rows automatically. `User` rows created as fixtures (there's
   no cascade from Application to its creator/assignee Users) are tracked and deleted
   separately.

Every test file imports the app's own Prisma singleton via `tests/testDb.ts` (`import {
prisma } from '@/lib/db/prisma'`) — never a second `PrismaClient` instance.

## What's covered

- `tests/services/applications.test.ts` — `src/lib/services/applications.ts`
- `tests/services/environments.test.ts` — `src/lib/services/environments.ts`
- `tests/services/errorCodes.test.ts` — `src/lib/services/errorCodes.ts` (including
  `findOrAutoRegisterErrorContent()`'s concurrency/race-recovery path)
- `tests/services/promotions.test.ts` — `src/lib/services/promotions.ts`
- `tests/services/users.test.ts` — `src/lib/services/users.ts`
- `tests/lib/rbac.test.ts` — `src/lib/auth/rbac.ts` (`requireRole()`,
  `requireApplicationAccess()`)
- `tests/api/lookup.test.ts` — `src/app/api/v1/lookup/route.ts`, the public API route,
  invoked directly (`GET()` called with a real `NextRequest`, not an HTTP round-trip)

## What's explicitly out of scope

**Server Actions** (`src/actions/*.ts`) are not covered here. They're thin wrappers around
the service functions, RBAC guards, and zod validation already tested above, glued together
with `next-auth`'s `auth()` (request-scoped cookie/session context that's expensive and
low-value to fake convincingly in a test) and Next's `revalidatePath` (a caching side effect,
not business logic). The service-layer, RBAC, and API-route tests already cover every actual
business rule and security boundary a Server Action enforces; testing the wrappers on top
would mostly re-test the same logic through more mocking, not add new coverage. This is a
deliberate, stated scope boundary, not an oversight.
