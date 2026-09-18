import { Prisma } from '@prisma/client';
import type { PromotionRequest } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

// Epic 6 (US-6.1 through US-6.5) business logic — the promotion request/review/approve/reject
// workflow described in docs/environments-and-promotion.md. Follows
// src/lib/services/errorCodes.ts's pattern: typed errors, $transaction for multi-row writes,
// P2002 caught and rethrown as a typed error where a DB-level constraint backs a service-level
// pre-check.

/** Thrown by submitPromotionRequest() when the source ErrorContent's Environment is itself
 *  production — a promotion can only be submitted *from* a NonProd environment, per
 *  docs/environments-and-promotion.md ("Moving content from a NonProd environment into a Prod
 *  environment ... is a request/approval flow"). */
export class InvalidPromotionSourceError extends Error {
  constructor(message = 'Only NonProd content can be submitted for promotion.') {
    super(message);
    this.name = 'InvalidPromotionSourceError';
  }
}

/** Thrown by submitPromotionRequest() when a PENDING request already exists for this exact
 *  (errorMessageId, language, targetEnvironmentId) — matches the DB's partial unique index
 *  (PromotionRequest_no_duplicate_pending_key, in
 *  prisma/migrations/20260917123800_db_level_constraints/migration.sql). */
export class DuplicatePendingPromotionError extends Error {
  constructor() {
    super(
      'A promotion request for this code, language, and target environment is already pending.',
    );
    this.name = 'DuplicatePendingPromotionError';
  }
}

/** Thrown by approvePromotionRequest()/rejectPromotionRequest() when the request has already
 *  been reviewed (status is not PENDING) — e.g. a second reviewer acting on a stale page, or a
 *  double-click. */
export class PromotionRequestNotPendingError extends Error {
  constructor() {
    super('This promotion request has already been reviewed.');
    this.name = 'PromotionRequestNotPendingError';
  }
}

/** Thrown by approvePromotionRequest()/rejectPromotionRequest() when the reviewer is the same
 *  user who submitted the request — the app-layer half of the submitter-≠-approver rule
 *  (docs/environments-and-promotion.md: "The submitter cannot approve their own request — this
 *  is a hard rule ... enforced server-side"). The DB's CHECK constraint
 *  (PromotionRequest_submitter_not_reviewer_check) is defense-in-depth only, not a substitute
 *  for this check — it must run first so the UI gets a clean, typed, user-facing error instead
 *  of a raw Postgres constraint-violation error. */
export class SelfReviewError extends Error {
  constructor(
    message = 'You submitted this request — another eligible reviewer must approve or reject it.',
  ) {
    super(message);
    this.name = 'SelfReviewError';
  }
}

/** The submitted-content fields captured into a PromotionRequest.contentSnapshot at submit
 *  time — a write-once copy that must survive later edits to the live source ErrorContent row
 *  (docs/environments-and-promotion.md). Field set matches ErrorContent in
 *  prisma/schema.prisma exactly, minus id/timestamps/needsAuthoring/the
 *  errorMessageId+language+environmentId key (those are stored as PromotionRequest's own
 *  columns, not duplicated into the JSON). */
export interface ContentSnapshot {
  header: string;
  description: string;
  friendlyMessage: string;
  category: string;
  errorCategory: string;
  httpCode: number;
  alertString: string;
  redirectUrl: string | null;
  eventId: string | null;
  eventCategory: string | null;
  transIdDisplay: boolean;
  retryEnabled: boolean;
  errorCodeDisplay: boolean;
}

/**
 * US-6.1 — Submits a NonProd (language, environment) content row for promotion to the
 * Application's production Environment. Snapshots the content as it exists right now
 * (contentSnapshot), so later edits to the source row never retroactively change what's under
 * review.
 */
export async function submitPromotionRequest({
  errorContentId,
  submittedByUserId,
}: {
  errorContentId: string;
  submittedByUserId: string;
}): Promise<PromotionRequest> {
  const sourceContent = await prisma.errorContent.findUnique({
    where: { id: errorContentId },
    include: {
      environment: true,
      errorMessage: { select: { applicationId: true } },
    },
  });

  if (!sourceContent) {
    throw new Error('That content row does not exist.');
  }

  if (sourceContent.environment.isProduction) {
    throw new InvalidPromotionSourceError();
  }

  const targetEnvironment = await prisma.environment.findFirst({
    where: { applicationId: sourceContent.errorMessage.applicationId, isProduction: true },
  });

  if (!targetEnvironment) {
    // Should be impossible — every Application gets its production Environment at
    // registration (src/lib/services/applications.ts's createApplication()) and the DB's
    // partial unique index (Environment_applicationId_one_production_key) caps it at one.
    // This guards against a data-integrity bug, not a normal user-facing error.
    throw new Error('This Application has no production Environment configured.');
  }

  const contentSnapshot: ContentSnapshot = {
    header: sourceContent.header,
    description: sourceContent.description,
    friendlyMessage: sourceContent.friendlyMessage,
    category: sourceContent.category,
    errorCategory: sourceContent.errorCategory,
    httpCode: sourceContent.httpCode,
    alertString: sourceContent.alertString,
    redirectUrl: sourceContent.redirectUrl,
    eventId: sourceContent.eventId,
    eventCategory: sourceContent.eventCategory,
    transIdDisplay: sourceContent.transIdDisplay,
    retryEnabled: sourceContent.retryEnabled,
    errorCodeDisplay: sourceContent.errorCodeDisplay,
  };

  try {
    return await prisma.promotionRequest.create({
      data: {
        errorMessageId: sourceContent.errorMessageId,
        language: sourceContent.language,
        sourceEnvironmentId: sourceContent.environmentId,
        targetEnvironmentId: targetEnvironment.id,
        contentSnapshot: contentSnapshot as unknown as Prisma.InputJsonValue,
        status: 'PENDING',
        submittedByUserId,
        submittedAt: new Date(),
      },
    });
  } catch (error) {
    // Defense-in-depth against a race between two concurrent submissions for the same
    // (errorMessageId, language, targetEnvironmentId) — the DB's partial unique index
    // (PromotionRequest_no_duplicate_pending_key) is the actual guard.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DuplicatePendingPromotionError();
    }
    throw error;
  }
}

// Shared include shape for both the pending queue and the history view — an ErrorMessage's
// code, the submitter's public fields, and both environments' names.
const PROMOTION_REQUEST_LIST_INCLUDE = {
  errorMessage: { select: { id: true, code: true, applicationId: true } },
  submittedBy: { select: { id: true, name: true, email: true } },
  sourceEnvironment: { select: { id: true, name: true } },
  targetEnvironment: { select: { id: true, name: true } },
} satisfies Prisma.PromotionRequestInclude;

export type PromotionRequestSummary = Prisma.PromotionRequestGetPayload<{
  include: typeof PROMOTION_REQUEST_LIST_INCLUDE;
}>;

// History additionally includes the (nullable) reviewer's public fields.
const PROMOTION_REQUEST_HISTORY_INCLUDE = {
  ...PROMOTION_REQUEST_LIST_INCLUDE,
  reviewedBy: { select: { id: true, name: true, email: true } },
} satisfies Prisma.PromotionRequestInclude;

export type PromotionRequestHistoryEntry = Prisma.PromotionRequestGetPayload<{
  include: typeof PROMOTION_REQUEST_HISTORY_INCLUDE;
}>;

/**
 * US-6.2 — Every PENDING promotion request for the Application's error codes, oldest first
 * (a review queue). PromotionRequest has no direct applicationId column, so this joins through
 * errorMessage.
 */
export async function listPendingPromotionsForApplication(
  applicationId: string,
): Promise<PromotionRequestSummary[]> {
  return prisma.promotionRequest.findMany({
    where: { status: 'PENDING', errorMessage: { applicationId } },
    include: PROMOTION_REQUEST_LIST_INCLUDE,
    orderBy: { submittedAt: 'asc' },
  });
}

/**
 * US-6.5 — Every promotion request for the Application's error codes regardless of status,
 * newest first — the read-only audit trail.
 */
export async function listPromotionHistoryForApplication(
  applicationId: string,
): Promise<PromotionRequestHistoryEntry[]> {
  return prisma.promotionRequest.findMany({
    where: { errorMessage: { applicationId } },
    include: PROMOTION_REQUEST_HISTORY_INCLUDE,
    orderBy: { submittedAt: 'desc' },
  });
}

export interface PendingPromotionKey {
  language: string;
  targetEnvironmentId: string;
}

/**
 * For the code detail page (src/app/(admin)/applications/[applicationId]/codes/[codeId]/
 * page.tsx) — every PENDING request's (language, targetEnvironmentId) for one error code, so
 * the page can show "Promotion pending" per NonProd row instead of a duplicate submit button,
 * without pulling in the full PromotionRequestSummary shape it doesn't need.
 */
export async function listPendingPromotionsForErrorMessage(
  errorMessageId: string,
): Promise<PendingPromotionKey[]> {
  return prisma.promotionRequest.findMany({
    where: { errorMessageId, status: 'PENDING' },
    select: { language: true, targetEnvironmentId: true },
  });
}

/**
 * US-6.3 — Approves a pending promotion request: upserts the snapshot into the target
 * (production) ErrorContent row and marks the request APPROVED, in one transaction.
 * needsAuthoring is explicitly cleared — this content has been authored, submitted, and
 * reviewed, not freshly auto-registered.
 */
export async function approvePromotionRequest({
  promotionRequestId,
  reviewerId,
}: {
  promotionRequestId: string;
  reviewerId: string;
}): Promise<PromotionRequest> {
  const request = await prisma.promotionRequest.findUnique({
    where: { id: promotionRequestId },
  });

  if (!request) {
    throw new Error('That promotion request does not exist.');
  }

  if (request.status !== 'PENDING') {
    throw new PromotionRequestNotPendingError();
  }

  if (request.submittedByUserId === reviewerId) {
    throw new SelfReviewError();
  }

  const snapshot = request.contentSnapshot as unknown as ContentSnapshot;

  return prisma.$transaction(async (tx) => {
    await tx.errorContent.upsert({
      where: {
        errorMessageId_language_environmentId: {
          errorMessageId: request.errorMessageId,
          language: request.language,
          environmentId: request.targetEnvironmentId,
        },
      },
      create: {
        errorMessageId: request.errorMessageId,
        language: request.language,
        environmentId: request.targetEnvironmentId,
        ...snapshot,
        needsAuthoring: false,
      },
      update: {
        ...snapshot,
        needsAuthoring: false,
      },
    });

    return tx.promotionRequest.update({
      where: { id: promotionRequestId },
      data: {
        status: 'APPROVED',
        reviewedByUserId: reviewerId,
        reviewedAt: new Date(),
      },
    });
  });
}

/**
 * US-6.4 — Rejects a pending promotion request with a required reason. Prod content is left
 * untouched. Same PromotionRequestNotPendingError/SelfReviewError guards as
 * approvePromotionRequest() — a rejection is also a review action subject to the
 * submitter-≠-approver rule.
 */
export async function rejectPromotionRequest({
  promotionRequestId,
  reviewerId,
  rejectionReason,
}: {
  promotionRequestId: string;
  reviewerId: string;
  rejectionReason: string;
}): Promise<PromotionRequest> {
  const request = await prisma.promotionRequest.findUnique({
    where: { id: promotionRequestId },
  });

  if (!request) {
    throw new Error('That promotion request does not exist.');
  }

  if (request.status !== 'PENDING') {
    throw new PromotionRequestNotPendingError();
  }

  if (request.submittedByUserId === reviewerId) {
    throw new SelfReviewError();
  }

  return prisma.promotionRequest.update({
    where: { id: promotionRequestId },
    data: {
      status: 'REJECTED',
      reviewedByUserId: reviewerId,
      reviewedAt: new Date(),
      rejectionReason,
    },
  });
}

/** For Server Actions that only receive a promotionRequestId and need to resolve the owning
 *  applicationId before calling requireApplicationAccess() (src/actions/promotions.ts's
 *  approvePromotionAction/rejectPromotionAction) — same purpose and "existence vs access" split
 *  as src/lib/services/errorCodes.ts's getApplicationIdForErrorMessage()/
 *  getErrorContentOwnership(). Also returns the owning errorMessageId, since callers need it to
 *  revalidatePath() the code detail page. Returns null if the request doesn't exist. */
export async function getApplicationIdForPromotionRequest(
  promotionRequestId: string,
): Promise<{ applicationId: string; errorMessageId: string } | null> {
  const request = await prisma.promotionRequest.findUnique({
    where: { id: promotionRequestId },
    select: { errorMessageId: true, errorMessage: { select: { applicationId: true } } },
  });

  if (!request) {
    return null;
  }

  return {
    applicationId: request.errorMessage.applicationId,
    errorMessageId: request.errorMessageId,
  };
}
