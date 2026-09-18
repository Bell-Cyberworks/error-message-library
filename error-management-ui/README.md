# Error Management UI

The full-stack admin application that owns the error catalog: app owners register their apps and manage their error codes here, and its backend serves the public API that [libraries](../libraries/README.md) and [Error UI](../error-ui/README.md) call.

See [Error Code Schema](../docs/error-code-schema.md) for the field contract this app manages and the JSON shape its API returns.

## Responsibilities

### Admin frontend
- Register a new app (`APPNAME`).
- Per-app manager view: every error code registered for that app, split into codes still on auto-generated placeholder text (**needs authoring**) and codes already authored.
- Edit form for every field on a code (see schema doc).
- Preview: raw JSON, plus a rendered sample of both the full-page and inline/toast presentation for that code.

### Backend API (Postgres-backed)
- Public lookup endpoint: given `APPNAME + CODE + LANGUAGE`, returns the error JSON. Unknown `(APPNAME, CODE)` pairs are auto-registered with placeholder text and flagged for authoring — the lookup still succeeds.
- CRUD for error code definitions, per app and per locale.
- App registration and owner auth for the admin side.

## Planned Structure

One deployable Next.js app (App Router, TypeScript) — frontend and backend API in the same codebase and container, not a separate backend service plus frontend. See [Management UI Architecture](../docs/management-ui-architecture.md) for the full rationale, tech stack, auth/RBAC design, and database schema.

```
error-management-ui/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── (admin)/                # session-gated route group: applications/, users/
│   │   ├── (auth)/login/
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/ # Auth.js route handler
│   │   │   └── v1/                 # public API — Libraries + Error UI consume this
│   │   │       ├── lookup/
│   │   │       └── health/
│   │   └── layout.tsx
│   ├── lib/
│   │   ├── auth/                   # Auth.js config + requireRole()/requireApplicationAccess()
│   │   ├── db/                     # Prisma client singleton
│   │   ├── services/               # shared business logic (Server Actions AND route handlers)
│   │   └── validation/             # zod schemas
│   ├── actions/                    # Server Actions for admin-side mutations
│   └── components/
├── Dockerfile
└── package.json
```

Runs as one of the services in the root [docker-compose.yml](../docker-compose.yml), backed by the `postgres` service defined there.

## Status

**Scaffold in place, features still stubs.** The initial skeleton exists: the Prisma schema (Users/roles, Applications, Environments, ErrorMessage/ErrorContent, PromotionRequest), Auth.js credentials login with database-backed sessions, the `requireRole`/`requireApplicationAccess` RBAC guards, the full App Router route structure (including the `(admin)` session-gated group), and a working `/api/v1/lookup` read path and `/api/v1/health` check. `lib/services/*`, `actions/*`, `components/`, and most page content are not yet implemented — each stub page has a `// TODO:` comment referencing the backlog story it corresponds to.

Session gating for the `(admin)` group happens in `src/app/(admin)/layout.tsx` (a Server Component `auth()` check), not edge middleware — database-backed sessions need a Postgres round-trip, which the pg driver and argon2's native binding can't do on the Edge runtime. Server Actions and route handlers still must call `requireRole()`/`requireApplicationAccess()` themselves; the layout guard only covers page navigation.

See [Management UI Architecture](../docs/management-ui-architecture.md) for the design this scaffold follows, and [Management UI v1 Backlog](../docs/management-ui-backlog.md) for what's still to build.

### Automated tests

An automated test suite now exists under `tests/` (Vitest), running against a real Postgres test database rather than mocks — the same scenarios every prior PR up to this point verified with manual throwaway scripts. Covered: every `src/lib/services/*.ts` module (`applications`, `environments`, `errorCodes` — including the public lookup API's auto-registration concurrency/race path — `promotions`, `users`), `src/lib/auth/rbac.ts`'s `requireRole()`/`requireApplicationAccess()` guards, and `src/app/api/v1/lookup/route.ts` invoked directly. **Server Actions** (`src/actions/*.ts`) are explicitly out of scope — see `tests/README.md` for why.

```bash
# One-time: apply migrations to a dedicated test database (never point this at dev data).
DATABASE_URL=postgresql://<user>:<pass>@<host>:5432/<test-db> npx prisma migrate deploy

# Run the suite.
DATABASE_URL=postgresql://<user>:<pass>@<host>:5432/<test-db> npm test
```

See `tests/README.md` for the full test-database requirements, the `test:watch`/`test:coverage` variants, and the test-isolation convention (collision-safe unique names + per-file cleanup, no transactional rollback).
