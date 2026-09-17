# Management UI Architecture

This is the architecture decision for `error-management-ui`: one fullstack app, or a separate backend API + frontend. It also covers the auth/RBAC design and database schema needed for login, roles, and Application ownership. Companion to [Error Code Schema](error-code-schema.md) and [Environments & Promotion](environments-and-promotion.md), which define the data contract this implements.

## Decision: single fullstack app

`error-management-ui` is one deployable Next.js app — frontend and backend API in the same codebase and container — not a separate backend service plus frontend.

**Why:**

- **Self-hosted deployment fit.** EML's whole pitch is a company runs the stack themselves via `docker-compose up`. One container for the Management UI is less operational burden for third parties running it than two services that must be versioned and kept API-compatible together.
- **Auth/RBAC fits naturally in one app.** Login, two roles, an Admin → Application Admin assignment model, and a server-enforced submitter-≠-approver rule are all much simpler when session handling and data access live in the same process, with no cross-service trust boundary (shared secrets, CORS/CSRF) to design.
- **Nothing here needs a split backend's strengths.** The prior reference implementation split into a Go API + separate Next.js UI mainly because Go was the chosen backend language — not because of a requirement that still applies. This is a CRUD-heavy admin tool with moderate traffic (hit by internal libraries, not internet-scale). The user has no language preference and confirmed Go/Next were just past choices, not a constraint.
- **Libraries and Error UI are unaffected either way.** They call `APPNAME+CODE+LANGUAGE+ENVIRONMENT` over plain JSON REST, whether that endpoint lives in a monolith's route handlers or a standalone service.
- **The admin UI and the public lookup API have genuinely different scaling profiles, but that's a deployment concern, not a codebase-split concern.** A self-hosted install can range from ~10 Applications to ~4000; the Management UI's load tracks admin headcount (even a 4000-Application install might only have ~250 Application Admin users), while the public lookup API's load tracks end-user/service traffic across every app in the company and scales with Applications, not admins. Keeping one codebase doesn't force them to scale together: `app/api/v1/*` is deliberately isolated behind its own `lib/services/lookup.ts`, with no dependency on admin-only code paths, so it can either (a) ride along with the admin UI's container replicas — cheap and simplest, fine for smaller installs — or (b) be extracted into its own independently-scaled service later for a large install, without touching the data model or rewriting the lookup logic, only how it's deployed. Building two separate services from day one pays that operational cost for every self-hosted install, including the ~10-Application ones that will never need it.

## Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15 (App Router), TypeScript, single Node/Docker deploy |
| ORM | Prisma, Postgres provider |
| Auth | Auth.js (NextAuth) v5, Credentials provider (email + password), **database-backed sessions** via Prisma Adapter (not JWT-only — needed so an Admin can revoke a session/deactivate a user instantly) |
| Password hashing | argon2id (bcrypt if native bindings are a container-build issue) |
| Validation | zod, shared between Server Actions and route handlers |
| Public API (Libraries + Error UI) | Plain REST JSON route handlers under `app/api/v1/*` — must stay framework-agnostic since Libraries are multi-language (Go/Python/Java/JS) |
| Admin mutations | Server Actions calling a shared `lib/services/*` layer, so business logic + validation + RBAC checks aren't duplicated between the admin UI and the public API |
| Migrations | Prisma Migrate (not GORM-style auto-migrate) |

## Auth & RBAC

**Login:** email + password via Auth.js Credentials provider, checked against `User.passwordHash`. Sessions are database-backed, so they're centrally revocable.

**Roles** — a global enum on `User`, not per-Application:
- `ADMIN` (super-admin) — registers Applications, manages Users, creates/removes Application Admin assignments. Implicit access to every Application (role check bypasses the assignment check; no assignment rows generated per app).
- `APPLICATION_ADMIN` — access scoped to whichever Applications they're assigned to. A user can hold this role with zero assignments (expected right after account creation, before an Admin assigns them anywhere).

**Assignment:** an explicit join table, not a foreign key on `User` — an Application can have multiple Application Admins and a user can be assigned to multiple Applications. This also matters for the promotion rule below: an Application needs to be assignable to more than one Application Admin for the submitter-≠-approver rule to be satisfiable without always escalating to an Admin.

**Enforcement — two guards, used everywhere (Server Actions, route handlers, page loaders — never client-side only):**
- `requireRole(session, 'ADMIN')` — Application registration, user management, assignment management.
- `requireApplicationAccess(session, applicationId)` — true if the user is `ADMIN`, or has an assignment row for that Application. Used for all error-code CRUD, environment management, and promotion actions.

**Submitter ≠ approver:** not a separate role — both submitting and reviewing a `PromotionRequest` just require `requireApplicationAccess`. The hard constraint is enforced twice:
1. **App layer** — the approve/reject action checks `promotionRequest.submittedByUserId !== session.user.id` before doing anything.
2. **DB layer** — a `CHECK` constraint (`submitted_by_user_id <> reviewed_by_user_id`, only when `reviewed_by_user_id IS NOT NULL`) as defense-in-depth, since `environments-and-promotion.md` calls this "a hard rule, not just a UI nudge."

This resolves that doc's open question about who may submit vs. approve: anyone with access to the Application, as long as it's not the same person twice — which means an Application with only one assigned Application Admin needs an Admin in the approval loop. Worth knowing operationally: single-owner Applications can't self-approve promotions.

**Session/credential storage:** the same Postgres database via Prisma (`User`, `Session`, plus Auth.js's `Account`/`VerificationToken` tables, kept unused for now so SSO/OIDC can be added later without a migration). No separate identity provider needed for v1.

## Database schema

One Postgres database, one Prisma schema. IDs are cuid/uuid throughout.

- **User** — `id`, `email` (unique), `passwordHash`, `name`, `role` (`ADMIN` | `APPLICATION_ADMIN`), `isActive`, timestamps.
- **Session** — Auth.js-managed: `id`, `sessionToken` (unique), `userId` → User, `expires`.
- **ApplicationAdminAssignment** — `id`, `userId` → User, `applicationId` → Application, `assignedByUserId` → User, `assignedAt`. Unique on `(userId, applicationId)`.
- **Application** — `id`, `name` (unique — this is `APPNAME`), `createdByUserId` → User, timestamps. Relations: `environments[]`, `errorMessages[]`, admins via the assignment table.
- **Environment** — `id`, `applicationId` → Application, `name` (owner-defined text), `isProduction` (bool), `sortOrder` (nullable int), timestamps. Unique on `(applicationId, name)`. **Partial unique index on `applicationId` where `is_production`** — enforces exactly one production environment per Application at the DB level.
- **ErrorMessage** — the code's identity: `id`, `applicationId` → Application, `code`, timestamps. Unique on `(applicationId, code)` — the `(APPNAME, CODE)` key.
- **ErrorContent** — per-`(code, language, environment)` content, flattening the prior reference's two-hop model into one row per lookup grain: `id`, `errorMessageId` → ErrorMessage, `language`, `environmentId` → Environment, plus every field from `error-code-schema.md` (`header`, `description`, `friendlyMessage`, `category`, `errorCategory`, `httpCode`, `alertString`, `redirectUrl`, `eventId`, `eventCategory`, `transIdDisplay`, `retryEnabled`, `errorCodeDisplay`), `needsAuthoring` (bool, default `true`, cleared on first manual edit), timestamps. Unique on `(errorMessageId, language, environmentId)` — the full `(APPNAME, CODE, LANGUAGE, ENVIRONMENT)` key.
- **PromotionRequest** — `id`, `errorMessageId` → ErrorMessage, `language`, `sourceEnvironmentId` → Environment, `targetEnvironmentId` → Environment, a content snapshot (recommend a single JSON column — this is write-once audit data, not something queried relationally, and must survive later edits to the live source row), `status` (`PENDING` | `APPROVED` | `REJECTED`), `submittedByUserId` → User, `submittedAt`, `reviewedByUserId` → User (nullable), `reviewedAt` (nullable), `rejectionReason` (nullable), timestamps, the submitter≠approver `CHECK` constraint above. Recommend a partial unique index on `(errorMessageId, language, targetEnvironmentId) WHERE status = 'PENDING'` to prevent two concurrent promotion requests racing for the same target.

## Folder structure — `error-management-ui/`

```
error-management-ui/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── (admin)/                        # session-gated route group
│   │   │   ├── layout.tsx                  # session guard + nav
│   │   │   ├── applications/
│   │   │   │   ├── page.tsx                # list + register (Admin only)
│   │   │   │   └── [applicationId]/
│   │   │   │       ├── page.tsx            # dashboard: needs-authoring vs authored codes
│   │   │   │       ├── admins/page.tsx     # manage Application Admin assignments (Admin only)
│   │   │   │       ├── environments/page.tsx
│   │   │   │       ├── codes/
│   │   │   │       │   ├── new/page.tsx    # manual add error code
│   │   │   │       │   └── [codeId]/page.tsx  # edit code + per-language/env content tabs
│   │   │   │       └── promotions/page.tsx # submit queue + review/approve queue
│   │   │   └── users/page.tsx              # Admin-only: manage Users/roles
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   └── v1/                         # public API — Libraries + Error UI consume this
│   │   │       ├── lookup/route.ts         # GET APPNAME+CODE+LANGUAGE+ENVIRONMENT
│   │   │       └── health/route.ts
│   │   └── layout.tsx
│   ├── lib/
│   │   ├── auth/
│   │   │   ├── options.ts                  # Auth.js config
│   │   │   └── rbac.ts                     # requireRole(), requireApplicationAccess()
│   │   ├── db/
│   │   │   └── prisma.ts
│   │   ├── services/                       # shared business logic (Server Actions AND route handlers)
│   │   │   ├── applications.ts
│   │   │   ├── errorCodes.ts
│   │   │   ├── environments.ts
│   │   │   ├── promotions.ts
│   │   │   └── lookup.ts                   # auto-registration-on-cache-miss logic
│   │   └── validation/                     # zod schemas
│   ├── actions/                            # Server Actions for admin-side mutations
│   │   ├── applications.ts
│   │   ├── errorCodes.ts
│   │   ├── environments.ts
│   │   └── promotions.ts
│   ├── components/
│   └── middleware.ts                       # route-level session gate for the (admin) group
├── Dockerfile
├── package.json
└── tests/
    ├── unit/
    └── integration/
```

No separate backend directory — `error-management-ui/` stays one deployable unit, matching `docker-compose.yml`'s existing single `error-management-ui` service.

## Open follow-up (not decided here)

The public `/api/v1/lookup` endpoint has no stated auth model yet in `error-code-schema.md` — Libraries call it directly, presumably unauthenticated today. Decide separately whether it stays open or moves to per-Application API keys before this ships publicly.
