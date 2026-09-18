import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import type { Environment } from '@prisma/client';
import {
  DuplicateContentError,
  DuplicateErrorCodeError,
  InvalidEnvironmentError,
  ProductionContentNotEditableError,
  addLanguageContent,
  createErrorCode,
  findOrAutoRegisterErrorContent,
  getErrorMessageWithContents,
  listErrorMessagesForApplication,
  updateErrorContent,
} from '@/lib/services/errorCodes';
import { createApplication } from '@/lib/services/applications';
import { createEnvironment } from '@/lib/services/environments';
import { prisma, uniqueSuffix } from '../testDb';

// Formalizes the errorCodes.ts scenarios previously verified manually (Epic 3/4's authoring
// flow, plus findOrAutoRegisterErrorContent() — the public lookup API's cache-miss path, the
// most safety-critical function in this module).
describe('errorCodes service', () => {
  let creatorUserId: string;
  let applicationId: string;
  let prodEnvironmentId: string;
  let nonProdEnvironment: Environment;
  const createdApplicationIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const creator = await prisma.user.create({
      data: {
        email: `ec-creator-${suffix}@example.com`,
        name: 'ErrorCodes Test Creator',
        passwordHash: 'unused-in-tests',
        role: Role.ADMIN,
        isActive: true,
      },
    });
    creatorUserId = creator.id;
    createdUserIds.push(creator.id);

    const application = await createApplication({
      name: `ErrorCodes Test App ${suffix}`,
      createdByUserId: creatorUserId,
    });
    applicationId = application.id;
    createdApplicationIds.push(application.id);

    const prodEnvironment = await prisma.environment.findFirstOrThrow({
      where: { applicationId, isProduction: true },
    });
    prodEnvironmentId = prodEnvironment.id;

    nonProdEnvironment = await createEnvironment({ applicationId, name: `NonProd ${suffix}` });
  });

  afterAll(async () => {
    if (createdApplicationIds.length > 0) {
      await prisma.application.deleteMany({ where: { id: { in: createdApplicationIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  describe('createErrorCode', () => {
    it('creates the ErrorMessage plus its first ErrorContent row with placeholder fields and needsAuthoring: true, in a NonProd environment', async () => {
      const suffix = uniqueSuffix();
      const code = `CODE-${suffix}`;

      const errorMessage = await createErrorCode({
        applicationId,
        environmentId: nonProdEnvironment.id,
        code,
        language: 'en',
      });

      expect(errorMessage.code).toBe(code);

      const content = await prisma.errorContent.findUnique({
        where: {
          errorMessageId_language_environmentId: {
            errorMessageId: errorMessage.id,
            language: 'en',
            environmentId: nonProdEnvironment.id,
          },
        },
      });

      expect(content).not.toBeNull();
      expect(content?.needsAuthoring).toBe(true);
      expect(content?.header).toBe('');
      expect(content?.description).toBe('');
      expect(content?.httpCode).toBe(0);
    });

    it('throws InvalidEnvironmentError when targeting a production environment', async () => {
      const suffix = uniqueSuffix();

      await expect(
        createErrorCode({
          applicationId,
          environmentId: prodEnvironmentId,
          code: `PRODCODE-${suffix}`,
          language: 'en',
        }),
      ).rejects.toThrow(InvalidEnvironmentError);
    });

    it('throws InvalidEnvironmentError when environmentId belongs to a different Application (cross-tenant guard)', async () => {
      const suffix = uniqueSuffix();
      const otherCreator = await prisma.user.create({
        data: {
          email: `ec-other-creator-${suffix}@example.com`,
          name: 'Other App Creator',
          passwordHash: 'unused-in-tests',
          role: Role.ADMIN,
          isActive: true,
        },
      });
      createdUserIds.push(otherCreator.id);

      const otherApplication = await createApplication({
        name: `Other App ${suffix}`,
        createdByUserId: otherCreator.id,
      });
      createdApplicationIds.push(otherApplication.id);

      const otherEnvironment = await createEnvironment({
        applicationId: otherApplication.id,
        name: `OtherEnv ${suffix}`,
      });

      await expect(
        createErrorCode({
          applicationId, // the shared Application from the outer beforeAll
          environmentId: otherEnvironment.id, // belongs to otherApplication, not applicationId
          code: `CROSSTENANT-${suffix}`,
          language: 'en',
        }),
      ).rejects.toThrow(InvalidEnvironmentError);
    });

    it('throws DuplicateErrorCodeError for a case-insensitive duplicate code within the same Application', async () => {
      const suffix = uniqueSuffix();
      const code = `DUP-${suffix}`;

      await createErrorCode({
        applicationId,
        environmentId: nonProdEnvironment.id,
        code,
        language: 'en',
      });

      await expect(
        createErrorCode({
          applicationId,
          environmentId: nonProdEnvironment.id,
          code: code.toLowerCase(),
          language: 'en',
        }),
      ).rejects.toThrow(DuplicateErrorCodeError);
    });
  });

  describe('getErrorMessageWithContents', () => {
    it('returns null if the errorMessageId does not belong to the given applicationId', async () => {
      const suffix = uniqueSuffix();
      const errorMessage = await createErrorCode({
        applicationId,
        environmentId: nonProdEnvironment.id,
        code: `SCOPED-${suffix}`,
        language: 'en',
      });

      const result = await getErrorMessageWithContents('some-other-application-id', errorMessage.id);

      expect(result).toBeNull();
    });

    it('returns the ErrorMessage with its contents when applicationId matches', async () => {
      const suffix = uniqueSuffix();
      const errorMessage = await createErrorCode({
        applicationId,
        environmentId: nonProdEnvironment.id,
        code: `MATCH-${suffix}`,
        language: 'en',
      });

      const result = await getErrorMessageWithContents(applicationId, errorMessage.id);

      expect(result).not.toBeNull();
      expect(result?.contents).toHaveLength(1);
    });
  });

  describe('listErrorMessagesForApplication', () => {
    it('needsAuthoring is true if any content row still needs authoring, and false once every row is authored', async () => {
      const suffix = uniqueSuffix();
      const code = `SUMMARY-${suffix}`;
      const errorMessage = await createErrorCode({
        applicationId,
        environmentId: nonProdEnvironment.id,
        code,
        language: 'en',
      });

      let summaries = await listErrorMessagesForApplication(applicationId);
      let summary = summaries.find((entry) => entry.id === errorMessage.id);
      expect(summary?.needsAuthoring).toBe(true);

      const content = await prisma.errorContent.findFirstOrThrow({
        where: { errorMessageId: errorMessage.id },
      });

      await updateErrorContent({
        errorContentId: content.id,
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

      summaries = await listErrorMessagesForApplication(applicationId);
      summary = summaries.find((entry) => entry.id === errorMessage.id);
      expect(summary?.needsAuthoring).toBe(false);

      // A second, not-yet-authored language row flips the "any" summary back to true.
      await addLanguageContent({
        errorMessageId: errorMessage.id,
        environmentId: nonProdEnvironment.id,
        language: 'fr',
      });

      summaries = await listErrorMessagesForApplication(applicationId);
      summary = summaries.find((entry) => entry.id === errorMessage.id);
      expect(summary?.needsAuthoring).toBe(true);
    });
  });

  describe('addLanguageContent', () => {
    it('creates a new empty content row for a NonProd environment', async () => {
      const suffix = uniqueSuffix();
      const errorMessage = await createErrorCode({
        applicationId,
        environmentId: nonProdEnvironment.id,
        code: `LANG-${suffix}`,
        language: 'en',
      });

      const content = await addLanguageContent({
        errorMessageId: errorMessage.id,
        environmentId: nonProdEnvironment.id,
        language: 'fr',
      });

      expect(content.language).toBe('fr');
      expect(content.needsAuthoring).toBe(true);
      expect(content.header).toBe('');
    });

    it('throws DuplicateContentError on a second call for the same (errorMessageId, language, environmentId)', async () => {
      const suffix = uniqueSuffix();
      const errorMessage = await createErrorCode({
        applicationId,
        environmentId: nonProdEnvironment.id,
        code: `LANGDUP-${suffix}`,
        language: 'en',
      });

      await addLanguageContent({
        errorMessageId: errorMessage.id,
        environmentId: nonProdEnvironment.id,
        language: 'fr',
      });

      await expect(
        addLanguageContent({
          errorMessageId: errorMessage.id,
          environmentId: nonProdEnvironment.id,
          language: 'fr',
        }),
      ).rejects.toThrow(DuplicateContentError);
    });

    it('throws InvalidEnvironmentError for a production target', async () => {
      const suffix = uniqueSuffix();
      const errorMessage = await createErrorCode({
        applicationId,
        environmentId: nonProdEnvironment.id,
        code: `LANGPROD-${suffix}`,
        language: 'en',
      });

      await expect(
        addLanguageContent({
          errorMessageId: errorMessage.id,
          environmentId: prodEnvironmentId,
          language: 'fr',
        }),
      ).rejects.toThrow(InvalidEnvironmentError);
    });
  });

  describe('updateErrorContent', () => {
    it('succeeds for a NonProd row and clears needsAuthoring to false', async () => {
      const suffix = uniqueSuffix();
      const errorMessage = await createErrorCode({
        applicationId,
        environmentId: nonProdEnvironment.id,
        code: `UPDATE-${suffix}`,
        language: 'en',
      });

      const content = await prisma.errorContent.findFirstOrThrow({
        where: { errorMessageId: errorMessage.id },
      });

      const updated = await updateErrorContent({
        errorContentId: content.id,
        header: 'New header',
        description: 'New description',
        friendlyMessage: 'New friendly message',
        category: 'General',
        errorCategory: 'Unclassified',
        httpCode: 404,
        alertString: 'page',
        redirectUrl: 'https://example.com',
        eventId: 'evt-1',
        eventCategory: 'cat-1',
        transIdDisplay: true,
        retryEnabled: true,
        errorCodeDisplay: true,
      });

      expect(updated.header).toBe('New header');
      expect(updated.needsAuthoring).toBe(false);
    });

    it('throws ProductionContentNotEditableError for a row whose environment isProduction: true', async () => {
      // Nothing in the normal service-layer flow creates Prod content except promotion
      // (src/lib/services/promotions.ts), so a raw Prisma insert straight into the Prod
      // environment is the only way to construct this scenario for a unit test — matches
      // how it was manually verified during the promotion-workflow PR.
      const suffix = uniqueSuffix();
      const errorMessage = await prisma.errorMessage.create({
        data: { applicationId, code: `PRODCONTENT-${suffix}` },
      });

      const prodContent = await prisma.errorContent.create({
        data: {
          errorMessageId: errorMessage.id,
          environmentId: prodEnvironmentId,
          language: 'en',
          header: 'Prod header',
          description: 'Prod description',
          friendlyMessage: 'Prod friendly message',
          category: 'General',
          errorCategory: 'Unclassified',
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
        updateErrorContent({
          errorContentId: prodContent.id,
          header: 'Attempted edit',
          description: prodContent.description,
          friendlyMessage: prodContent.friendlyMessage,
          category: prodContent.category,
          errorCategory: prodContent.errorCategory,
          httpCode: prodContent.httpCode,
          alertString: prodContent.alertString,
          redirectUrl: prodContent.redirectUrl,
          eventId: prodContent.eventId,
          eventCategory: prodContent.eventCategory,
          transIdDisplay: prodContent.transIdDisplay,
          retryEnabled: prodContent.retryEnabled,
          errorCodeDisplay: prodContent.errorCodeDisplay,
        }),
      ).rejects.toThrow(ProductionContentNotEditableError);
    });
  });

  describe('findOrAutoRegisterErrorContent', () => {
    it('auto-registers a brand-new code in a NonProd environment with the generic default content', async () => {
      const suffix = uniqueSuffix();
      const code = `AUTO-NONPROD-${suffix}`;

      const result = await findOrAutoRegisterErrorContent({
        applicationId,
        environmentId: nonProdEnvironment.id,
        code,
        language: 'en',
      });

      expect(result.autoRegistered).toBe(true);
      expect(result.errorMessage.code).toBe(code);
      // Matches AUTO_REGISTRATION_DEFAULT_CONTENT in src/lib/services/errorCodes.ts exactly.
      expect(result.content.header).toBe('Something Went Wrong');
      expect(result.content.description).toBe(
        'An unexpected error occurred and has not yet been documented for this application.',
      );
      expect(result.content.friendlyMessage).toBe(
        'An unexpected error occurred. Please try again or contact support.',
      );
      expect(result.content.category).toBe('General');
      expect(result.content.errorCategory).toBe('Unclassified');
      expect(result.content.httpCode).toBe(500);
      expect(result.content.alertString).toBe('page');
      expect(result.content.redirectUrl).toBeNull();
      expect(result.content.eventId).toBeNull();
      expect(result.content.eventCategory).toBeNull();
      expect(result.content.transIdDisplay).toBe(false);
      expect(result.content.retryEnabled).toBe(true);
      expect(result.content.errorCodeDisplay).toBe(true);
      expect(result.content.needsAuthoring).toBe(true);
    });

    it('auto-registers a brand-new code in a Prod environment (deliberately allowed, unlike createErrorCode)', async () => {
      const suffix = uniqueSuffix();
      const code = `AUTO-PROD-${suffix}`;

      const result = await findOrAutoRegisterErrorContent({
        applicationId,
        environmentId: prodEnvironmentId,
        code,
        language: 'en',
      });

      expect(result.autoRegistered).toBe(true);
      expect(result.content.needsAuthoring).toBe(true);
      expect(result.content.environmentId).toBe(prodEnvironmentId);
    });

    it('returns the same row on a second call for the exact same key, with autoRegistered: false, and only one ErrorMessage row exists', async () => {
      const suffix = uniqueSuffix();
      const code = `AUTO-REPEAT-${suffix}`;

      const first = await findOrAutoRegisterErrorContent({
        applicationId,
        environmentId: nonProdEnvironment.id,
        code,
        language: 'en',
      });

      const second = await findOrAutoRegisterErrorContent({
        applicationId,
        environmentId: nonProdEnvironment.id,
        code,
        language: 'en',
      });

      expect(second.autoRegistered).toBe(false);
      expect(second.content.id).toBe(first.content.id);
      expect(second.errorMessage.id).toBe(first.errorMessage.id);

      const messages = await prisma.errorMessage.findMany({
        where: { applicationId, code: { equals: code, mode: 'insensitive' } },
      });
      expect(messages).toHaveLength(1);
    });

    it('matches the same ErrorMessage row for a different case of an existing code, rather than creating a case-variant duplicate', async () => {
      const suffix = uniqueSuffix();
      const code = `AUTO-CASE-${suffix}`;

      const first = await findOrAutoRegisterErrorContent({
        applicationId,
        environmentId: nonProdEnvironment.id,
        code,
        language: 'en',
      });

      const second = await findOrAutoRegisterErrorContent({
        applicationId,
        environmentId: nonProdEnvironment.id,
        code: code.toLowerCase(),
        language: 'en',
      });

      expect(second.errorMessage.id).toBe(first.errorMessage.id);

      const messages = await prisma.errorMessage.findMany({
        where: { applicationId, code: { equals: code, mode: 'insensitive' } },
      });
      expect(messages).toHaveLength(1);
    });

    it('auto-registers just the missing content row for an existing code + never-authored language/environment, without touching already-authored content', async () => {
      const suffix = uniqueSuffix();
      const code = `AUTO-PARTIAL-${suffix}`;

      const errorMessage = await createErrorCode({
        applicationId,
        environmentId: nonProdEnvironment.id,
        code,
        language: 'en',
      });

      const existingContent = await prisma.errorContent.findFirstOrThrow({
        where: { errorMessageId: errorMessage.id, language: 'en', environmentId: nonProdEnvironment.id },
      });

      const authored = await updateErrorContent({
        errorContentId: existingContent.id,
        header: 'Already authored',
        description: 'Already authored description',
        friendlyMessage: 'Already authored friendly message',
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

      const result = await findOrAutoRegisterErrorContent({
        applicationId,
        environmentId: prodEnvironmentId, // never-authored environment for this code
        code,
        language: 'en',
      });

      expect(result.autoRegistered).toBe(true);
      expect(result.errorMessage.id).toBe(errorMessage.id);
      expect(result.content.header).toBe('Something Went Wrong');

      const untouched = await prisma.errorContent.findUniqueOrThrow({ where: { id: authored.id } });
      expect(untouched.header).toBe('Already authored');
      expect(untouched.needsAuthoring).toBe(false);
    });

    it('handles a concurrency race: two Promise.all calls for the same brand-new key both resolve to the same row, and only one ErrorMessage row exists afterward', async () => {
      const suffix = uniqueSuffix();
      const code = `AUTO-RACE-${suffix}`;

      const [first, second] = await Promise.all([
        findOrAutoRegisterErrorContent({
          applicationId,
          environmentId: nonProdEnvironment.id,
          code,
          language: 'en',
        }),
        findOrAutoRegisterErrorContent({
          applicationId,
          environmentId: nonProdEnvironment.id,
          code,
          language: 'en',
        }),
      ]);

      expect(first.content.id).toBe(second.content.id);
      expect(first.errorMessage.id).toBe(second.errorMessage.id);

      const messages = await prisma.errorMessage.findMany({
        where: { applicationId, code: { equals: code, mode: 'insensitive' } },
      });
      expect(messages).toHaveLength(1);
    });
  });
});
