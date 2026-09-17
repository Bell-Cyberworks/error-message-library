import { z } from 'zod';

// Epic 2 (US-2.1 through US-2.4) validation schemas — shared between Server Actions
// (src/actions/applications.ts, src/actions/users.ts) and, in principle, future route
// handlers, per management-ui-architecture.md's "Validation" row (zod, shared).

// US-2.1 — Register an Application. Uniqueness (case-insensitive) is enforced in
// src/lib/services/applications.ts, not here — zod only validates shape.
export const createApplicationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Application name is required.')
    .max(200, 'Application name must be 200 characters or fewer.'),
});

export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

// US-2.2 — Create an Application Admin account. Password minimum is set higher than a
// typical self-chosen-password policy (12 chars) since these are Admin-created accounts
// per the repo's resolved decision (no self-signup/invite flow in v1) — see
// management-ui-backlog.md's Epic 2 open question and prisma/seed.ts's comment.
export const createApplicationAdminSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required.')
    .max(320, 'Email must be 320 characters or fewer.')
    .email('Enter a valid email address.'),
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(200, 'Name must be 200 characters or fewer.'),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters.')
    .max(200, 'Password must be 200 characters or fewer.'),
});

export type CreateApplicationAdminInput = z.infer<typeof createApplicationAdminSchema>;

// US-2.3 — Assign an existing Application Admin user to an Application.
export const assignApplicationAdminSchema = z.object({
  userId: z.string().trim().min(1, 'Select a user to assign.'),
  applicationId: z.string().trim().min(1, 'Application is required.'),
});

export type AssignApplicationAdminInput = z.infer<typeof assignApplicationAdminSchema>;
