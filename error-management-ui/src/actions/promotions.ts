'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth/options';
import { requireApplicationAccess, UnauthorizedError } from '@/lib/auth/rbac';
import {
  submitPromotionRequest,
  approvePromotionRequest,
  rejectPromotionRequest,
  getApplicationIdForPromotionRequest,
  InvalidPromotionSourceError,
  DuplicatePendingPromotionError,
  PromotionRequestNotPendingError,
  SelfReviewError,
} from '@/lib/services/promotions';
import { getErrorContentOwnership } from '@/lib/services/errorCodes';
import {
  submitPromotionSchema,
  approvePromotionSchema,
  rejectPromotionSchema,
} from '@/lib/validation/promotions';
import type { ActionResult } from '@/lib/actions/result';

// Epic 6 Server Actions. Same shape as src/actions/errorCodes.ts: auth() +
// requireApplicationAccess() (not requireRole('ADMIN') — any Application Admin assigned to the
// Application, or an Admin, can submit/review/approve/reject, per
// docs/management-ui-backlog.md), zod validate, call the matching
// src/lib/services/promotions.ts function, revalidatePath() the affected page(s), typed service
// errors become a field/form ActionResult error, anything unexpected is rethrown.
//
// For actions keyed on an errorContentId/promotionRequestId rather than an applicationId
// directly, the owning applicationId is looked up first (getErrorContentOwnership() /
// getApplicationIdForPromotionRequest()) so the access check still runs — never skipped just
// because the id shape differs.

function revalidatePromotionPages(applicationId: string, errorMessageId: string): void {
  revalidatePath(`/applications/${applicationId}/promotions`);
  revalidatePath(`/applications/${applicationId}/codes/${errorMessageId}`);
}

// US-6.1 — Submit a NonProd code/language's content for promotion to Prod.
export async function submitPromotionAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();

  const errorContentId = formData.get('errorContentId');
  if (typeof errorContentId !== 'string' || !errorContentId) {
    return { success: false, error: 'Invalid request.' };
  }

  const ownership = await getErrorContentOwnership(errorContentId);
  if (!ownership) {
    return { success: false, error: 'That content row does not exist.' };
  }

  await requireApplicationAccess(session, ownership.applicationId);

  if (!session?.user) {
    // Unreachable in practice — requireApplicationAccess() above already throws
    // UnauthorizedError when there's no session. requireApplicationAccess() is async (unlike
    // requireRole()'s synchronous `asserts session is Session`), so TypeScript can't narrow
    // `session` across the await; this satisfies that without a non-null assertion.
    throw new UnauthorizedError();
  }

  const parsed = submitPromotionSchema.safeParse({ errorContentId });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  try {
    await submitPromotionRequest({
      errorContentId: parsed.data.errorContentId,
      submittedByUserId: session.user.id,
    });
  } catch (error) {
    if (
      error instanceof InvalidPromotionSourceError ||
      error instanceof DuplicatePendingPromotionError
    ) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  revalidatePromotionPages(ownership.applicationId, ownership.errorMessageId);
  return { success: true };
}

// US-6.3 — Approve a pending promotion request. Rejected by approvePromotionRequest() with a
// typed SelfReviewError if the reviewer is the submitter — the form that posts here
// (src/components/PromotionReviewControls.tsx) is already hidden from the submitter by the
// promotions page, but that's a UI nudge only; this is the actual enforcement.
export async function approvePromotionAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();

  const promotionRequestId = formData.get('promotionRequestId');
  if (typeof promotionRequestId !== 'string' || !promotionRequestId) {
    return { success: false, error: 'Invalid request.' };
  }

  const ownership = await getApplicationIdForPromotionRequest(promotionRequestId);
  if (!ownership) {
    return { success: false, error: 'That promotion request does not exist.' };
  }

  await requireApplicationAccess(session, ownership.applicationId);

  if (!session?.user) {
    throw new UnauthorizedError();
  }

  const parsed = approvePromotionSchema.safeParse({ promotionRequestId });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  try {
    await approvePromotionRequest({
      promotionRequestId: parsed.data.promotionRequestId,
      reviewerId: session.user.id,
    });
  } catch (error) {
    if (error instanceof PromotionRequestNotPendingError || error instanceof SelfReviewError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  revalidatePromotionPages(ownership.applicationId, ownership.errorMessageId);
  return { success: true };
}

// US-6.4 — Reject a pending promotion request with a required reason.
export async function rejectPromotionAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();

  const promotionRequestId = formData.get('promotionRequestId');
  if (typeof promotionRequestId !== 'string' || !promotionRequestId) {
    return { success: false, error: 'Invalid request.' };
  }

  const ownership = await getApplicationIdForPromotionRequest(promotionRequestId);
  if (!ownership) {
    return { success: false, error: 'That promotion request does not exist.' };
  }

  await requireApplicationAccess(session, ownership.applicationId);

  if (!session?.user) {
    throw new UnauthorizedError();
  }

  const parsed = rejectPromotionSchema.safeParse({
    promotionRequestId,
    rejectionReason: formData.get('rejectionReason'),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  try {
    await rejectPromotionRequest({
      promotionRequestId: parsed.data.promotionRequestId,
      reviewerId: session.user.id,
      rejectionReason: parsed.data.rejectionReason,
    });
  } catch (error) {
    if (error instanceof PromotionRequestNotPendingError || error instanceof SelfReviewError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  revalidatePromotionPages(ownership.applicationId, ownership.errorMessageId);
  return { success: true };
}
