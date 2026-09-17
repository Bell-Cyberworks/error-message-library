# Changelog

All notable changes to `error-management-ui` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version
numbers follow [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-09-17

### Added

- Epic 3: Application Admin — manual error code creation (US-3.1).
  - **US-3.1** — Application Admins (and Admins) can manually create a new error code for an
    Application (`/applications/[applicationId]/codes/new`), in a NonProd Environment they
    select. The code's first `ErrorContent` row is created empty/placeholder
    (`needsAuthoring: true`) in the same transaction as the `ErrorMessage`. Codes are unique
    (case-insensitive) within the Application; duplicates are rejected. Creating directly in a
    production Environment is blocked server-side, not just hidden in the UI.
- Epic 4: Application Admin — editing code details & per-language content (US-4.1–US-4.3).
  - **US-4.1/US-4.3** — Application Admins can edit a code's metadata/content per
    `(language, environment)` on the code detail page
    (`/applications/[applicationId]/codes/[codeId]`) for any NonProd Environment; saves are
    immediate and clear `needsAuthoring`. Editing is hard-blocked server-side for production
    Environments — Epic 6's promotion workflow (not yet built) is the only path into Prod
    content; the UI shows a read-only view with an "Edit via promotion (not yet implemented)"
    note instead of a form.
  - **US-4.2** — Application Admins can add a new language to an existing code, scoped to one
    NonProd Environment; the new row starts empty (never copied from an existing language).
    The "add language" dropdown only offers languages not already present in that environment
    for that code.
- Epic 5: Application Admin — per-environment content (US-5.1–US-5.2).
  - **US-5.1** — Application Admins can view all of an Application's Environments
    (`/applications/[applicationId]/environments`), with a "Production" badge on the one
    that's flagged.
  - **US-5.2** — NonProd edits save immediately without an approval step (see US-4.1/4.3).
  - **Scope deviation from the backlog as written**: US-5.1 only specifies "view and select"
    Environments. Nothing in Epics 1–2 ever creates a NonProd Environment (Application
    registration only auto-creates the initial Prod one), which blocked Epic 3 entirely
    (US-3.1 requires picking an *existing* NonProd Environment). A "New NonProd Environment"
    creation form was added to the Environments page to unblock this — isProduction is never
    settable from that form; it is always `false`. Flagged here as an intentional, scoped
    addition, not a silent expansion.
- New fixed v1 language list, `src/lib/constants/languages.ts` (15 common BCP-47 tags) —
  `docs/management-ui-backlog.md`'s "Open questions" leaves the language list source
  unresolved; this is a placeholder default, not a final decision, and should become
  Admin-configurable later.
- New shared modules: `src/lib/validation/environments.ts` and
  `src/lib/validation/errorCodes.ts` (zod schemas), `src/lib/services/environments.ts` and
  `src/lib/services/errorCodes.ts` (business logic + typed duplicate/invalid-environment/
  production-not-editable errors, `$transaction`-backed code creation), `src/actions/
  environments.ts` and `src/actions/errorCodes.ts` (Server Actions, all guarded by
  `requireApplicationAccess()` — not `requireRole('ADMIN')` — since Application Admins author
  their own Applications' codes), and four client form components under `src/components/`
  (`CreateEnvironmentForm`, `CreateErrorCodeForm`, `AddLanguageForm`, `EditErrorContentForm`).

### Changed

- `/applications/[applicationId]` (the Application dashboard) now lists the Application's
  error codes, split into "Needs authoring" and "Authored", each linking to its detail page,
  plus a "+ New error code" link and a "Manage Environments" link. Replaces the page's
  original `// TODO: US-2.1/2.3` placeholder comment, whose ticket reference was wrong when
  first scaffolded — this data belongs to Epic 3/4, not Epic 2.

### Notes

- No `prisma/schema.prisma` model changes — the Epic 3/4/5 data model (`Environment`,
  `ErrorMessage`, `ErrorContent`) already existed from the initial schema. No new migration
  required.
- Epic 6 (promotion workflow) is still not implemented. Production `ErrorContent` rows are
  therefore only ever reachable today via a not-yet-built path; this release's UI reflects
  that by hard-blocking direct Prod edits everywhere rather than offering a workflow that
  doesn't exist yet.

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
