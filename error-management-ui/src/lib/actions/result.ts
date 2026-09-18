// Shared return shape for Server Actions (src/actions/*) — lets calling forms render a
// field-level/form-level error without an exception crashing the request, per
// management-ui-architecture.md's Server Actions row. Unexpected (non-typed-service) errors
// are still rethrown by the actions themselves rather than being coerced into this shape.
//
// Generic over an optional bag of extra fields carried on the success branch only — every
// existing action continues to use the bare `ActionResult` (equivalent to `ActionResult<object>`,
// i.e. `{ success: true }`) unchanged. The one exception today is src/actions/apiKeys.ts's
// createApplicationApiKeyAction, which needs to carry the one-time raw API key back to its form
// (`ActionResult<{ rawKey: string }>` — see that file) without disturbing every other action's
// typing or introducing a parallel, one-off result type.
//
// Defaulting TSuccessExtra to `object` (not `Record<string, never>`) is deliberate:
// `{ success: true } & Record<string, never>` does NOT accept a plain `{ success: true }` value
// in TypeScript — the `Record<string, never>` index signature makes every property, including
// `success` itself, structurally `never`-constrained, so the literal every existing action
// already returns fails to type-check. `object` has no required properties and intersects
// cleanly, so `{ success: true }` remains assignable everywhere it already was.
export type ActionResult<TSuccessExtra extends object = object> =
  | ({ success: true } & TSuccessExtra)
  | { success: false; error: string };
