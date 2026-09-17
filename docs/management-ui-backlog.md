# Management UI v1 Backlog

A v1 backlog for `error-management-ui`, covering login, the Admin/Application Admin roles, manual error-code authoring, and the promotion workflow. Builds on [Error Code Schema](error-code-schema.md), [Environments & Promotion](environments-and-promotion.md), and [Management UI Architecture](management-ui-architecture.md) — read those for the data model and role definitions referenced below.

## Open questions

These are called out inline in the epics below too, but worth resolving early since they affect scope:

- **How do Application Admin user accounts get created?** The backlog below assumes an Admin can create a user account directly (not just assign an existing one) — confirm this is in scope for v1, vs. accounts being provisioned some other way (seed script, self-signup, etc.).
- **Language list source** — is it a fixed predefined list (e.g. ISO codes) or something an Admin configures? Affects the "add language" UI (US-4.2).
- **Promotion granularity** — v1 assumes a promotion request covers one code's one language at a time (not a bulk multi-code/multi-language submission). `environments-and-promotion.md` leaves this open; flagging again since it shapes the promotion UI.

## Epic 1: Authentication & session

**US-1.1 — Login.** As a user (Admin or Application Admin), I want to log in with email + password, so I can access the Management UI.
- Valid credentials → authenticated session, redirected to dashboard.
- Invalid credentials → error shown, no session created.
- Session is database-backed (per architecture doc) so an Admin can revoke it by deactivating the user.

**US-1.2 — Session persistence & logout.** As a logged-in user, I want my session to persist across refreshes and to be able to log out, so I don't need to re-authenticate constantly but can end my session when done.
- Refresh keeps the session; logout clears it and redirects to login; an expired session redirects to login on next action.

**US-1.3 — Unauthenticated access blocked.** As a system, I want every protected route and API call to require a valid session, so unauthenticated users can't view or modify anything.
- Protected page → redirect to login. Protected API call without a session → 401.

## Epic 2: Admin — Application registration & Application Admin assignment

**US-2.1 — Register an Application.** As an Admin, I want to register a new Application, so its error codes can be managed.
- Unique name (case-insensitive) required; duplicate → error.
- Registering an Application creates its initial Prod environment automatically (`isProduction = true`); additional NonProd environments are added afterward via environment management (not blocking registration).

**US-2.2 — Create an Application Admin account.** As an Admin, I want to create a new user account with the Application Admin role, so I have someone to assign to an Application. *(Open question above — confirm in scope.)*
- Requires email, name; a temporary/set password or invite flow (mechanism TBD).

**US-2.3 — Assign an Application Admin to an Application.** As an Admin, I want to assign a user as Application Admin for a specific Application, so they can manage its error codes.
- Creates an `ApplicationAdminAssignment`. The user sees that Application in their dashboard immediately.
- Removing the assignment revokes access to that Application immediately.
- An Application can have more than one assigned Application Admin (needed so the promotion approval rule is satisfiable without an Admin every time).

**US-2.4 — View Applications and their admins.** As an Admin, I want to see all Applications and who's assigned to each, so I can audit ownership and adjust it.

## Epic 3: Application Admin — manual error code creation

**US-3.1 — Manually create an error code.** As an Application Admin, I want to create a new error code for my Application directly (not just via auto-registration), so I can pre-register codes before they ever fire in production.
- Code must be unique within the Application; duplicate → error.
- **Created in a NonProd environment the Application Admin selects** — not directly in Prod, consistent with the promotion workflow (Prod is only ever reached by promotion, never direct creation). Content starts empty/placeholder and the code is marked `needsAuthoring`.
- Once authored, it's promoted to Prod like any other content change (Epic 6) — it doesn't skip the approval gate just because it's new.

## Epic 4: Application Admin — editing code details & per-language content

**US-4.1 — Edit a code's metadata.** As an Application Admin, I want to edit a code's fields (header, description, friendly message, category, HTTP code, etc. — per Error Code Schema), so I can author accurate content.
- Editable in any NonProd environment directly, saved immediately, `needsAuthoring` cleared on first save.
- **Not directly editable in a Prod environment** — the UI routes that action to "submit for promotion" instead (Epic 6).

**US-4.2 — Add a language to a code.** As an Application Admin, I want to add a new language's content for a code, so it's available in that language.
- New language row starts empty — content is authored independently per language, not copied from an existing one.
- Language list source: open question above.

**US-4.3 — Edit a language's content.** As an Application Admin, I want to edit a specific language's content for a code, so I can maintain accurate per-language text.
- Same NonProd-direct / Prod-via-promotion split as US-4.1, scoped to one language.

## Epic 5: Application Admin — per-environment content

**US-5.1 — View and select environments.** As an Application Admin, I want to see all of my Application's environments and pick which one I'm viewing/editing, so I can author in NonProd before promoting to Prod.
- Selecting Prod shows content read-only (edits route to promotion, not a live form).

**US-5.2 — Edit directly in NonProd.** As an Application Admin, I want NonProd edits to save immediately without approval, so I can iterate quickly while authoring/testing.

## Epic 6: Promotion workflow

**US-6.1 — Submit for promotion.** As an Application Admin, I want to submit a NonProd code/language's content for promotion to Prod, so it can be reviewed before going live.
- Creates a `PromotionRequest` (`PENDING`) with a content snapshot, submitter, source/target environment, timestamp.
- The submitter cannot also approve it — enforced server-side (and DB-level `CHECK`), not just hidden in the UI.

**US-6.2 — Review pending requests.** As an Application Admin other than the submitter, I want to see a queue of pending promotion requests for Applications I'm assigned to, so I can review them.
- Shows submitted content, submitter, timestamp, source/target environment. Approve/reject only enabled for users who aren't the submitter.

**US-6.3 — Approve a request.** As an eligible Application Admin, I want to approve a pending request, so the reviewed content goes live in Prod.
- On approval: status → `APPROVED`, snapshot copied into the target Prod `ErrorContent` row (upsert), approver + timestamp recorded.

**US-6.4 — Reject a request.** As an eligible Application Admin, I want to reject a request with a reason, so incorrect content doesn't reach Prod.
- On rejection: status → `REJECTED`, reason + rejector + timestamp recorded, Prod unchanged. Submitter must re-author and resubmit (no in-place resubmit in v1).

**US-6.5 — Promotion audit trail.** As an Application Admin or Admin, I want to see the full history of promotion requests (any status) for an Application, so I can audit who changed what and when.
- Read-only, never edited/deleted. Admins see all Applications' history; Application Admins see only their assigned ones'.

## Epic 7: Access control

**US-7.1 — Application Admin access is scoped.** As a system, I want an Application Admin to only read/write Applications they're assigned to, so data stays isolated between Applications.
- Enforced server-side on every request (`requireApplicationAccess`), not just hidden in the UI — attempting to reach an unassigned Application returns 403.

**US-7.2 — Admin has full access.** As an Admin, I want to see and manage every Application and user, so I can oversee the whole system.
- Admins are still subject to the promotion approval rule (can't approve their own submissions) — no role is exempt.

**US-7.3 — No anonymous access.** As a system, I want every admin action to require authentication, so unauthenticated requests are always rejected (401).

## Not in v1

Bulk create/edit, code templates/cloning, scheduled promotions, multi-reviewer approval, custom/fine-grained roles, email notifications, full-text search, undo/revert of a promotion.
