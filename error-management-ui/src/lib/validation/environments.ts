import { z } from 'zod';

// Epic 5 (US-5.1, extended — see src/app/(admin)/applications/[applicationId]/environments/
// page.tsx's comment — to also cover NonProd Environment creation) validation. Follows
// src/lib/validation/applications.ts's convention: uniqueness is enforced in
// src/lib/services/environments.ts, not here — zod only validates shape.

// isProduction is never accepted from this form — every Environment created here is always
// NonProd (isProduction: false). The only isProduction: true Environment is the one
// auto-created at Application registration (src/lib/services/applications.ts's
// createApplication()).
export const createEnvironmentSchema = z.object({
  applicationId: z.string().trim().min(1, 'Application is required.'),
  name: z
    .string()
    .trim()
    .min(1, 'Environment name is required.')
    .max(100, 'Environment name must be 100 characters or fewer.'),
});

export type CreateEnvironmentInput = z.infer<typeof createEnvironmentSchema>;
