# Changelog

All notable changes to `error-management-ui` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version
numbers follow [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-09-17

### Added

- Epic 2: Admin — Application registration & Application Admin assignment (US-2.1–US-2.4).
  - **US-2.1** — Admins can register a new Application (`/applications`). Names are
    case-insensitive-unique; registration auto-creates the Application's initial `Prod`
    Environment in the same transaction.
  - **US-2.2** — Admins can create Application Admin user accounts (`/users`), setting an
    initial password directly (no self-signup/invite flow in v1).
  - **US-2.3** — Admins can assign and remove Application Admins for a specific Application
    (`/applications/[applicationId]/admins`). An Application can have multiple assigned
    admins.
  - **US-2.4** — The Applications list (`/applications`) branches on role: Admins see every
    Application and its assigned admins; Application Admins see only Applications they're
    assigned to.
  - Cross-cutting: every new mutation and data read is enforced server-side via
    `requireRole()`/`requireApplicationAccess()` (`src/lib/auth/rbac.ts`) — an Application
    Admin visiting an Application they're not assigned to is denied, not shown the data
    (US-7.1/US-7.2, applied narrowly to this Epic's surface area).
- New shared modules: `src/lib/validation/applications.ts` (zod schemas),
  `src/lib/services/applications.ts` and `src/lib/services/users.ts` (business logic +
  typed duplicate/not-found/invalid-target errors), `src/actions/applications.ts` and
  `src/actions/users.ts` (Server Actions), and three small client form components under
  `src/components/`.

### Fixed

- Auth.js's `Credentials` provider cannot be used with `session: { strategy: 'database' }` —
  Auth.js refuses to boot (`UnsupportedStrategy`), since the Prisma adapter's session table is
  only populated by its own sign-in flow (OAuth-style providers), not by a custom
  `authorize()` callback. Switched to `strategy: 'jwt'`. The instant-revocation guarantee
  `docs/management-ui-architecture.md` called for database sessions to provide is preserved
  via an `isActive` re-check in the `session` callback on every request instead of deleting a
  `Session` row — an Admin deactivating a user still takes effect on that user's very next
  request, without them needing to sign out. Caught by an end-to-end login test against a
  real Postgres instance; not something `tsc`/`eslint`/`next build` alone would have surfaced.

### Notes

- No `prisma/schema.prisma` model changes — the Epic 2 data model (`Application`,
  `Environment`, `User`, `ApplicationAdminAssignment`) already existed. This release does
  add the project's first generated migrations (`prisma/migrations/20260917123734_init` and
  a hand-written follow-up, `20260917123800_db_level_constraints`, for the two constraints
  Prisma schema syntax can't express — see the `NOTE:` comments in `schema.prisma`), since
  none existed yet to run this Epic's code against.
