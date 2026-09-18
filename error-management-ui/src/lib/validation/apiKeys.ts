import { z } from 'zod';

// API key management validation. Follows src/lib/validation/applications.ts's convention:
// uniqueness is enforced in src/lib/services/apiKeys.ts, not here — zod only validates shape.

export const createApplicationApiKeySchema = z.object({
  applicationId: z.string().trim().min(1, 'Application is required.'),
  name: z
    .string()
    .trim()
    .min(1, 'Key name is required.')
    .max(200, 'Key name must be 200 characters or fewer.'),
});

export type CreateApplicationApiKeyInput = z.infer<typeof createApplicationApiKeySchema>;

export const revokeApplicationApiKeySchema = z.object({
  applicationId: z.string().trim().min(1, 'Application is required.'),
  id: z.string().trim().min(1, 'API key is required.'),
});

export type RevokeApplicationApiKeyInput = z.infer<typeof revokeApplicationApiKeySchema>;

export const createSystemApiKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Key name is required.')
    .max(200, 'Key name must be 200 characters or fewer.'),
});

export type CreateSystemApiKeyInput = z.infer<typeof createSystemApiKeySchema>;

export const revokeSystemApiKeySchema = z.object({
  id: z.string().trim().min(1, 'API key is required.'),
});

export type RevokeSystemApiKeyInput = z.infer<typeof revokeSystemApiKeySchema>;
