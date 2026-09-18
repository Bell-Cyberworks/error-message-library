import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import type { Environment } from '@prisma/client';
import {
  DuplicatePendingPromotionError,
  InvalidPromotionSourceError,
  PromotionRequestNotPendingError,
  SelfReviewError,
  approvePromotionRequest,
  listPendingPromotionsForApplication,
  listPendingPromotionsForErrorMessage,
  listPromotionHistoryForApplication,
  rejectPromotionRequest,
  submitPromotionRequest,
} from '@/lib/services/promotions';
import { createApplication } from '@/lib/services/applications';
import { createEnvironment } from '@/lib/services/environments';
import { createErrorCode, updateErrorContent } from '@/lib/services/errorCodes';
import { createApplicationAdminUser } from '@/lib/services/users';
import { prisma, uniqueSuffix } from '../testDb';

// Formalizes the promotions.ts scenarios previously verified manually (Epic 6, US-6.1–US-6.5).
describe('promotions service', () => {
  let creatorUserId: string;
  let applicationId: string;
  let prodEnvironmentId: string;
  let nonProdEnvironment: Environment;
  let submitterId: string;
  let reviewerId: string;
  const createdApplicationIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const creator = await prisma.user.create({
      data: {
        email: `promo-creator-${suffix}@example.com`,
        name: 'Promotions Test Creator',
        passwordHash: 'unused-in-tests',
        role: Role.ADMIN,
        isActive: true,
      },
    });
    creatorUserId = creator.id;
    createdUserIds.push(creator.id);

    const application = await createApplication({
      name: `Promotions Test App ${suffix}`,
      createdByUserId: creatorUserId,
    });
    applicationId = application.id;
    createdApplicationIds.push(application.id);

    const prodEnvironment = await prisma.environment.findFirstOrThrow({
      where: { applicationId, isProduction: true },
    });
    prodEnvironmentId = prodEnvironment.id;

    nonProdEnvironment = await createEnvironment({ applicationId, name: `NonProd ${suffix}` });

    const submitter = await createApplicationAdminUser({
      email: `promo-submitter-${suffix}@example.com`,
      name: 'Submitter',
      password: 'Password123!',
    });
    submitterId = submitter.id;
    createdUserIds.push(submitter.id);

    const reviewer = await createApplicationAdminUser({
      email: `promo-reviewer-${suffix}@example.com`,
      name: 'Reviewer',
      password: 'Password123!',
    });
    reviewerId = reviewer.id;
    createdUserIds.push(reviewer.id);
  });

  afterAll(async () => {
    if (createdApplicationIds.length > 0) {
      await prisma.application.deleteMany({ where: { id: { in: createdApplicationIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  /** Creates a fresh error code with a fully-authored NonProd content row (real field values,
   *  needsAuthoring cleared) — the state submitPromotionRequest() is meant to be called on. */
  async function createAuthoredNonProdContent(codeSuffix: string) {
    const errorMessage = await createErrorCode({
      applicationId,
      environmentId: nonProdEnvironment.id,
      code: `PROMO-${codeSuffix}`,
      language: 'en',
    });

    const placeholder = await prisma.errorContent.findFirstOrThrow({
      where: { errorMessageId: errorMessage.id },
    });

    const authored = await updateErrorContent({
      errorContentId: placeholder.id,
      header: 'Authored header',
      description: 'Authored description',
      friendlyMessage: 'Authored friendly message',
      category: 'General',
      errorCategory: 'Unclassified',
      httpCode: 400,
      alertString: 'toast',
      redirectUrl: null,
      eventId: null,
      eventCategory: null,
      transIdDisplay: false,
      retryEnabled: false,
      errorCodeDisplay: false,
    });

    return { errorMessage, content: authored };
  }

  describe('submitPromotionRequest', () => {
    it('creates a PENDING request with a contentSnapshot matching the source content at submission time', async () => {
      const suffix = uniqueSuffix();
      const { content } = await createAuthoredNonProdContent(suffix);

      const request = await submitPromotionRequest({
        errorContentId: content.id,
        submittedByUserId: submitterId,
      });

      expect(request.status).toBe('PENDING');
      expect(request.targetEnvironmentId).toBe(prodEnvironmentId);
      expect(request.sourceEnvironmentId).toBe(nonProdEnvironment.id);

      const snapshot = request.contentSnapshot as unknown as Record<string, unknown>;
      expect(snapshot.header).toBe(content.header);
      expect(snapshot.description).toBe(content.description);
      expect(snapshot.friendlyMessage).toBe(content.friendlyMessage);
      expect(snapshot.httpCode).toBe(content.httpCode);
    });

    it('throws InvalidPromotionSourceError when submitting from a production environment content row', async () => {
      const suffix = uniqueSuffix();
      const errorMessage = await prisma.errorMessage.create({
        data: { applicationId, code: `PROMO-PROD-${suffix}` },
      });
      const prodContent = await prisma.errorContent.create({
        data: {
          errorMessageId: errorMessage.id,
          environmentId: prodEnvironmentId,
          language: 'en',
          header: 'h',
          description: 'd',
          friendlyMessage: 'f',
          category: 'c',
          errorCategory: 'ec',
          httpCode: 500,
          alertString: 'page',
          redirectUrl: null,
          eventId: null,
          eventCategory: null,
          transIdDisplay: false,
          retryEnabled: false,
          errorCodeDisplay: false,
          needsAuthoring: false,
        },
      });

      await expect(
        submitPromotionRequest({ errorContentId: prodContent.id, submittedByUserId: submitterId }),
      ).rejects.toThrow(InvalidPromotionSourceError);
    });

    it('throws DuplicatePendingPromotionError on a second submission for the same (errorMessageId, language, targetEnvironmentId) while the first is still PENDING', async () => {
      const suffix = uniqueSuffix();
      const { content } = await createAuthoredNonProdContent(suffix);

      await submitPromotionRequest({ errorContentId: content.id, submittedByUserId: submitterId });

      await expect(
        submitPromotionRequest({ errorContentId: content.id, submittedByUserId: submitterId }),
      ).rejects.toThrow(DuplicatePendingPromotionError);
    });
  });

  describe('approvePromotionRequest', () => {
    it('throws SelfReviewError when the submitter attempts to approve their own request', async () => {
      const suffix = uniqueSuffix();
      const { content } = await createAuthoredNonProdContent(suffix);
      const request = await submitPromotionRequest({
        errorContentId: content.id,
        submittedByUserId: submitterId,
      });

      await expect(
        approvePromotionRequest({ promotionRequestId: request.id, reviewerId: submitterId }),
      ).rejects.toThrow(SelfReviewError);
    });

    it('succeeds for a different user: creates the target Prod ErrorContent row fresh, clears needsAuthoring, and marks APPROVED', async () => {
      const suffix = uniqueSuffix();
      const { errorMessage, content } = await createAuthoredNonProdContent(suffix);
      const request = await submitPromotionRequest({
        errorContentId: content.id,
        submittedByUserId: submitterId,
      });

      const approved = await approvePromotionRequest({ promotionRequestId: request.id, reviewerId });

      expect(approved.status).toBe('APPROVED');
      expect(approved.reviewedByUserId).toBe(reviewerId);
      expect(approved.reviewedAt).not.toBeNull();

      const prodContent = await prisma.errorContent.findUniqueOrThrow({
        where: {
          errorMessageId_language_environmentId: {
            errorMessageId: errorMessage.id,
            language: content.language,
            environmentId: prodEnvironmentId,
          },
        },
      });

      expect(prodContent.header).toBe(content.header);
      expect(prodContent.needsAuthoring).toBe(false);
    });

    it('succeeds for a different user, updating an existing target Prod ErrorContent row (the upsert-update path)', async () => {
      const suffix = uniqueSuffix();
      const { errorMessage, content } = await createAuthoredNonProdContent(suffix);

      await prisma.errorContent.create({
        data: {
          errorMessageId: errorMessage.id,
          environmentId: prodEnvironmentId,
          language: content.language,
          header: 'Old prod header',
          description: 'Old',
          friendlyMessage: 'Old',
          category: 'Old',
          errorCategory: 'Old',
          httpCode: 500,
          alertString: 'page',
          redirectUrl: null,
          eventId: null,
          eventCategory: null,
          transIdDisplay: false,
          retryEnabled: false,
          errorCodeDisplay: false,
          needsAuthoring: false,
        },
      });

      const request = await submitPromotionRequest({
        errorContentId: content.id,
        submittedByUserId: submitterId,
      });
      await approvePromotionRequest({ promotionRequestId: request.id, reviewerId });

      const prodContent = await prisma.errorContent.findUniqueOrThrow({
        where: {
          errorMessageId_language_environmentId: {
            errorMessageId: errorMessage.id,
            language: content.language,
            environmentId: prodEnvironmentId,
          },
        },
      });

      expect(prodContent.header).toBe(content.header);
      expect(prodContent.header).not.toBe('Old prod header');
      expect(prodContent.needsAuthoring).toBe(false);
    });

    it('throws PromotionRequestNotPendingError when approving an already-reviewed request', async () => {
      const suffix = uniqueSuffix();
      const { content } = await createAuthoredNonProdContent(suffix);
      const request = await submitPromotionRequest({
        errorContentId: content.id,
        submittedByUserId: submitterId,
      });
      await approvePromotionRequest({ promotionRequestId: request.id, reviewerId });

      await expect(
        approvePromotionRequest({ promotionRequestId: request.id, reviewerId }),
      ).rejects.toThrow(PromotionRequestNotPendingError);
    });
  });

  describe('rejectPromotionRequest', () => {
    it('throws SelfReviewError when the submitter attempts to reject their own request', async () => {
      const suffix = uniqueSuffix();
      const { content } = await createAuthoredNonProdContent(suffix);
      const request = await submitPromotionRequest({
        errorContentId: content.id,
        submittedByUserId: submitterId,
      });

      await expect(
        rejectPromotionRequest({
          promotionRequestId: request.id,
          reviewerId: submitterId,
          rejectionReason: 'no',
        }),
      ).rejects.toThrow(SelfReviewError);
    });

    it('a different user rejecting with a reason marks REJECTED with the reason stored, and the target Prod content is left untouched (never existed)', async () => {
      const suffix = uniqueSuffix();
      const { errorMessage, content } = await createAuthoredNonProdContent(suffix);
      const request = await submitPromotionRequest({
        errorContentId: content.id,
        submittedByUserId: submitterId,
      });

      const rejected = await rejectPromotionRequest({
        promotionRequestId: request.id,
        reviewerId,
        rejectionReason: 'Not ready yet.',
      });

      expect(rejected.status).toBe('REJECTED');
      expect(rejected.rejectionReason).toBe('Not ready yet.');
      expect(rejected.reviewedByUserId).toBe(reviewerId);
      expect(rejected.reviewedAt).not.toBeNull();

      const prodContent = await prisma.errorContent.findUnique({
        where: {
          errorMessageId_language_environmentId: {
            errorMessageId: errorMessage.id,
            language: content.language,
            environmentId: prodEnvironmentId,
          },
        },
      });
      expect(prodContent).toBeNull();
    });

    it('leaves an existing target Prod content row completely unchanged on rejection', async () => {
      const suffix = uniqueSuffix();
      const { errorMessage, content } = await createAuthoredNonProdContent(suffix);

      const existingProdContent = await prisma.errorContent.create({
        data: {
          errorMessageId: errorMessage.id,
          environmentId: prodEnvironmentId,
          language: content.language,
          header: 'Untouched prod header',
          description: 'Untouched',
          friendlyMessage: 'Untouched',
          category: 'Untouched',
          errorCategory: 'Untouched',
          httpCode: 500,
          alertString: 'page',
          redirectUrl: null,
          eventId: null,
          eventCategory: null,
          transIdDisplay: false,
          retryEnabled: false,
          errorCodeDisplay: false,
          needsAuthoring: false,
        },
      });

      const request = await submitPromotionRequest({
        errorContentId: content.id,
        submittedByUserId: submitterId,
      });
      await rejectPromotionRequest({
        promotionRequestId: request.id,
        reviewerId,
        rejectionReason: 'Not ready.',
      });

      const stillThere = await prisma.errorContent.findUniqueOrThrow({
        where: { id: existingProdContent.id },
      });
      expect(stillThere.header).toBe('Untouched prod header');
      expect(stillThere.updatedAt.getTime()).toBe(existingProdContent.updatedAt.getTime());
    });

    it('throws PromotionRequestNotPendingError when rejecting an already-reviewed request', async () => {
      const suffix = uniqueSuffix();
      const { content } = await createAuthoredNonProdContent(suffix);
      const request = await submitPromotionRequest({
        errorContentId: content.id,
        submittedByUserId: submitterId,
      });
      await rejectPromotionRequest({
        promotionRequestId: request.id,
        reviewerId,
        rejectionReason: 'Not ready.',
      });

      await expect(
        rejectPromotionRequest({
          promotionRequestId: request.id,
          reviewerId,
          rejectionReason: 'Again.',
        }),
      ).rejects.toThrow(PromotionRequestNotPendingError);
    });
  });

  describe('listing helpers', () => {
    it('listPendingPromotionsForApplication returns only this Application\'s PENDING requests', async () => {
      const suffix = uniqueSuffix();
      const { content: contentA } = await createAuthoredNonProdContent(`${suffix}-a`);
      const { content: contentB } = await createAuthoredNonProdContent(`${suffix}-b`);

      const requestA = await submitPromotionRequest({
        errorContentId: contentA.id,
        submittedByUserId: submitterId,
      });
      const requestB = await submitPromotionRequest({
        errorContentId: contentB.id,
        submittedByUserId: submitterId,
      });
      await approvePromotionRequest({ promotionRequestId: requestB.id, reviewerId });

      const pending = await listPendingPromotionsForApplication(applicationId);

      expect(pending.some((request) => request.id === requestA.id)).toBe(true);
      expect(pending.some((request) => request.id === requestB.id)).toBe(false);
    });

    it('listPendingPromotionsForApplication orders oldest first', async () => {
      const suffix = uniqueSuffix();
      const { content: contentA } = await createAuthoredNonProdContent(`${suffix}-older`);
      const requestOlder = await submitPromotionRequest({
        errorContentId: contentA.id,
        submittedByUserId: submitterId,
      });

      const { content: contentB } = await createAuthoredNonProdContent(`${suffix}-newer`);
      const requestNewer = await submitPromotionRequest({
        errorContentId: contentB.id,
        submittedByUserId: submitterId,
      });

      const pending = await listPendingPromotionsForApplication(applicationId);
      const indexOlder = pending.findIndex((request) => request.id === requestOlder.id);
      const indexNewer = pending.findIndex((request) => request.id === requestNewer.id);

      expect(indexOlder).toBeGreaterThanOrEqual(0);
      expect(indexNewer).toBeGreaterThanOrEqual(0);
      expect(indexOlder).toBeLessThan(indexNewer);
    });

    it('listPromotionHistoryForApplication returns every request regardless of status, newest first', async () => {
      const suffix = uniqueSuffix();
      const { content } = await createAuthoredNonProdContent(suffix);
      const request = await submitPromotionRequest({
        errorContentId: content.id,
        submittedByUserId: submitterId,
      });
      await approvePromotionRequest({ promotionRequestId: request.id, reviewerId });

      const history = await listPromotionHistoryForApplication(applicationId);
      const found = history.find((entry) => entry.id === request.id);

      expect(found).toBeDefined();
      expect(found?.status).toBe('APPROVED');
    });

    it('listPendingPromotionsForErrorMessage returns only this error code\'s pending (language, targetEnvironmentId) keys', async () => {
      const suffix = uniqueSuffix();
      const { errorMessage, content } = await createAuthoredNonProdContent(suffix);
      const request = await submitPromotionRequest({
        errorContentId: content.id,
        submittedByUserId: submitterId,
      });

      const pendingKeys = await listPendingPromotionsForErrorMessage(errorMessage.id);
      expect(pendingKeys).toHaveLength(1);
      expect(pendingKeys[0]?.language).toBe(content.language);
      expect(pendingKeys[0]?.targetEnvironmentId).toBe(prodEnvironmentId);

      await approvePromotionRequest({ promotionRequestId: request.id, reviewerId });

      const afterApproval = await listPendingPromotionsForErrorMessage(errorMessage.id);
      expect(afterApproval).toHaveLength(0);
    });
  });
});
