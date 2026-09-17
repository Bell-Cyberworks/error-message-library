import { z } from 'zod';
import { LANGUAGE_CODES } from '@/lib/constants/languages';

// Epic 3/4 (US-3.1 through US-4.3) validation. Follows src/lib/validation/applications.ts's
// convention: uniqueness (of a code within an Application, or a language within a code's
// environment) is enforced in src/lib/services/errorCodes.ts, not here — zod only validates
// shape.

const languageCodeSchema = z
  .string()
  .trim()
  .min(1, 'Select a language.')
  .refine((value) => LANGUAGE_CODES.includes(value), {
    message: 'Select a supported language.',
  });

// Permissive-but-real error code shape: alphanumeric plus "_", "-", "." — no whitespace, so a
// code can't be garbage, without being overly strict about a house naming convention v1 hasn't
// settled on.
const errorCodeValueSchema = z
  .string()
  .trim()
  .min(1, 'Code is required.')
  .max(100, 'Code must be 100 characters or fewer.')
  .regex(
    /^[A-Za-z0-9_.-]+$/,
    'Code may only contain letters, numbers, "_", "-", and "." (no spaces).',
  );

// US-3.1 — Manually create a new error code. environmentId must point at a NonProd
// Environment belonging to applicationId — enforced (not just validated) in
// src/lib/services/errorCodes.ts's createErrorCode(), since that's an access/integrity check,
// not a shape check.
export const createErrorCodeSchema = z.object({
  applicationId: z.string().trim().min(1, 'Application is required.'),
  environmentId: z.string().trim().min(1, 'Select an environment.'),
  code: errorCodeValueSchema,
  language: languageCodeSchema,
});

export type CreateErrorCodeInput = z.infer<typeof createErrorCodeSchema>;

// US-4.2 — Add a language to an existing error code, scoped to one NonProd Environment.
export const addLanguageSchema = z.object({
  errorMessageId: z.string().trim().min(1, 'Error code is required.'),
  environmentId: z.string().trim().min(1, 'Environment is required.'),
  language: languageCodeSchema,
});

export type AddLanguageInput = z.infer<typeof addLanguageSchema>;

// US-4.1/4.3 — Edit a code's per-(language, environment) content. Field set/types match
// ErrorContent in prisma/schema.prisma exactly. Checkbox fields (transIdDisplay,
// retryEnabled, errorCodeDisplay) arrive as native booleans here — callers (see
// src/actions/errorCodes.ts) are responsible for normalizing a raw FormData checkbox
// ("on" when checked, absent from the FormData entirely when unchecked) to a boolean before
// this schema sees it; absence must become `false`, not a validation error.
export const updateErrorContentSchema = z.object({
  errorContentId: z.string().trim().min(1, 'Content row is required.'),
  header: z
    .string()
    .trim()
    .min(1, 'Header is required.')
    .max(500, 'Header must be 500 characters or fewer.'),
  description: z
    .string()
    .trim()
    .min(1, 'Description is required.')
    .max(5000, 'Description must be 5000 characters or fewer.'),
  friendlyMessage: z
    .string()
    .trim()
    .min(1, 'Friendly message is required.')
    .max(2000, 'Friendly message must be 2000 characters or fewer.'),
  category: z
    .string()
    .trim()
    .min(1, 'Category is required.')
    .max(200, 'Category must be 200 characters or fewer.'),
  errorCategory: z
    .string()
    .trim()
    .min(1, 'Error category is required.')
    .max(200, 'Error category must be 200 characters or fewer.'),
  httpCode: z.coerce
    .number()
    .int('HTTP code must be a whole number.')
    .min(0, 'HTTP code must be 0 or greater.')
    .max(599, 'HTTP code must be 599 or less.'),
  alertString: z
    .string()
    .trim()
    .min(1, 'Alert string is required.')
    .max(200, 'Alert string must be 200 characters or fewer.'),
  // Optional String? fields in ErrorContent — a blank/absent form value clears the field
  // (stored as null), not left undefined, so an existing value can actually be removed.
  redirectUrl: z
    .string()
    .trim()
    .max(2000, 'Redirect URL must be 2000 characters or fewer.')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  eventId: z
    .string()
    .trim()
    .max(200, 'Event ID must be 200 characters or fewer.')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  eventCategory: z
    .string()
    .trim()
    .max(200, 'Event category must be 200 characters or fewer.')
    .optional()
    .transform((value) => (value && value.length > 0 ? value : null)),
  transIdDisplay: z.boolean(),
  retryEnabled: z.boolean(),
  errorCodeDisplay: z.boolean(),
});

export type UpdateErrorContentInput = z.infer<typeof updateErrorContentSchema>;
