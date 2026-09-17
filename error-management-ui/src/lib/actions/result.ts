// Shared return shape for Server Actions (src/actions/*) — lets calling forms render a
// field-level/form-level error without an exception crashing the request, per
// management-ui-architecture.md's Server Actions row. Unexpected (non-typed-service) errors
// are still rethrown by the actions themselves rather than being coerced into this shape.
export type ActionResult = { success: true } | { success: false; error: string };
