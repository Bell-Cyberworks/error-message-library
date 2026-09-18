import { z } from 'zod';

// Epic 6 (US-6.1 through US-6.4) validation. Follows src/lib/validation/errorCodes.ts's
// convention: ownership/state checks (does the content/request exist, is it NonProd/PENDING,
// is the reviewer the submitter) are enforced in src/lib/services/promotions.ts, not here —
// zod only validates shape.

// US-6.1 — Submit a NonProd content row for promotion.
export const submitPromotionSchema = z.object({
  errorContentId: z.string().trim().min(1, 'Content row is required.'),
});

export type SubmitPromotionInput = z.infer<typeof submitPromotionSchema>;

// US-6.3 — Approve a pending promotion request.
export const approvePromotionSchema = z.object({
  promotionRequestId: z.string().trim().min(1, 'Promotion request is required.'),
});

export type ApprovePromotionInput = z.infer<typeof approvePromotionSchema>;

// US-6.4 — Reject a pending promotion request; a non-empty reason is required so a rejected
// submitter knows what to fix before re-authoring and resubmitting.
export const rejectPromotionSchema = z.object({
  promotionRequestId: z.string().trim().min(1, 'Promotion request is required.'),
  rejectionReason: z
    .string()
    .trim()
    .min(1, 'A reason is required to reject a promotion request.')
    .max(1000, 'Rejection reason must be 1000 characters or fewer.'),
});

export type RejectPromotionInput = z.infer<typeof rejectPromotionSchema>;
