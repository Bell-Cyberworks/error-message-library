# Environments & Promotion

This defines how an Application's error codes move from being authored/tested to being live in production, and the approval gate that guards that move. It's a companion to the [Error Code Schema](error-code-schema.md), which defines the content fields themselves.

## Environments are configurable, not a fixed enum

Environments are records an Application owner defines, not a hardcoded `Dev`/`Test`/`Stage`/`Prod` list. Each environment has:

| Field | Meaning |
|---|---|
| `NAME` | Display name for the environment (e.g. `Dev`, `QA`, `NonProd`, `Prod`) — owner-defined text, not an enum value. |
| `IS_PRODUCTION` | Marks this environment as the one end users/production traffic actually see. Drives which promotions require approval (see below). Exactly one production environment is expected per Application. |
| `SORT_ORDER` | Optional display ordering in the Management UI (e.g. so NonProd environments list left-to-right in promotion order). |

Every `ErrorDetails`-equivalent row (per `APPNAME + CODE + LANGUAGE`) has its own independent copy of content **per environment** — editing a NonProd environment's content never touches Prod until that content is explicitly promoted.

> A prior implementation used a fixed `Dev`/`Test`/`Stage`/`Prod` enum with the same per-environment-holds-full-content shape. That per-environment content model is kept here as a reference; the fixed enum is not — environments are user-defined in this rebuild.

## Promotion workflow

Moving content from a NonProd environment into a Prod environment (any environment with `IS_PRODUCTION = true`) is a request/approval flow, not a direct edit:

1. **Submit** — An owner finishes authoring/testing content in a NonProd environment and submits it for promotion to a target Prod environment. This creates a `PromotionRequest` in `PENDING` status, snapshotting the submitted content, the submitter, and the source/target environments.
2. **Review & approve/reject** — A different user than the submitter reviews the pending request and either approves or rejects it. **The submitter cannot approve their own request** — this is a hard rule, not just a UI nudge, and should be enforced server-side.
3. **Apply** — On approval, the snapshotted content is copied into the target Prod environment's row (upsert, keyed on `APPNAME + CODE + LANGUAGE + ENVIRONMENT`). On rejection, nothing changes in Prod; the request is closed out with a reason.
4. **Audit trail** — `PromotionRequest` rows are retained (not deleted) as history: who submitted, when, who approved/rejected, when, and what content was promoted. This is new relative to prior work — see below.

Only environments with `IS_PRODUCTION = true` require this request/approval flow to be updated. Edits to non-production environments can be made directly by an owner, same as today's "edit a code's content" flow.

> Open questions not yet decided: the exact role/permission model for who is allowed to submit vs. approve (beyond "not the same person"), whether approval is required per-language or can cover a whole code's promotion in one action, and whether rejected requests can be resubmitted or must be re-authored from scratch.

## Why this is new

A prior implementation had environments and a "publish" action, but promotion was a single button that copied a NonProd environment's fields straight into Prod on click — no submit/approve separation, no audit trail, no check preventing self-approval. This doc's request/approval flow is the intentional replacement for that gap.

## Where this is used

- **Error Management UI** owns the `PromotionRequest` workflow UI (submit, review queue, approve/reject) and enforces the submitter-≠-approver rule.
- **Error Code Schema**'s lookup and response shape gain the `ENVIRONMENT` dimension described here — see [Error Code Schema](error-code-schema.md).
- **Libraries** and **Error UI** only ever read from an environment (typically the Application's Prod environment for real traffic, or a NonProd environment for testing) — they never see or interact with `PromotionRequest`s directly.
