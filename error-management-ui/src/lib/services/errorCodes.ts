import { Prisma } from '@prisma/client';
import type { ErrorMessage, ErrorContent } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

// Epic 3/4 (US-3.1 through US-4.3) business logic — manual error code creation and
// per-(language, environment) content authoring. Follows src/lib/services/applications.ts's
// pattern: case-insensitive-uniqueness pre-check + P2002 race defense, $transaction for
// multi-row writes, typed errors caught by src/actions/errorCodes.ts.

/**
 * Thrown when a supplied environmentId doesn't belong to the given Application, or is a
 * production Environment when a NonProd-only operation was attempted (code creation, adding a
 * language, editing content) — Prod content is only ever reached via promotion (Epic 6, not
 * yet built). This is both the cross-tenant/IDOR guard and the NonProd-only guard.
 */
export class InvalidEnvironmentError extends Error {
  constructor(
    message = 'The selected environment is not a valid NonProd environment for this Application.',
  ) {
    super(message);
    this.name = 'InvalidEnvironmentError';
  }
}

/** Thrown by createErrorCode() when the code already exists (case-insensitive) within the
 *  Application — matches the DB's @@unique([applicationId, code]) (case-sensitive at the DB
 *  level; the case-insensitive check is done here, same as createApplication() does for
 *  Application names). */
export class DuplicateErrorCodeError extends Error {
  constructor(code: string) {
    super(`An error code "${code}" already exists for this Application.`);
    this.name = 'DuplicateErrorCodeError';
  }
}

/** Thrown by addLanguageContent() when (errorMessageId, language, environmentId) already has
 *  a row — matches the DB's @@unique([errorMessageId, language, environmentId]). */
export class DuplicateContentError extends Error {
  constructor() {
    super('Content for this language already exists in this environment.');
    this.name = 'DuplicateContentError';
  }
}

/** Thrown by updateErrorContent() when the target row's Environment is production. Epic 6's
 *  promotion flow is the only path into Prod content — this is a hard block, not a soft
 *  warning, since Epic 6 isn't built yet. */
export class ProductionContentNotEditableError extends Error {
  constructor() {
    super('Production content cannot be edited directly — submit a promotion request instead.');
    this.name = 'ProductionContentNotEditableError';
  }
}

// Empty/placeholder ErrorContent fields for a newly-created row (US-3.1, US-4.2) — mirrors
// error-code-schema.md's auto-registration behavior ("placeholder default text" +
// needsAuthoring: true) for manually-created codes/languages too.
const PLACEHOLDER_CONTENT_FIELDS = {
  header: '',
  description: '',
  friendlyMessage: '',
  category: '',
  errorCategory: '',
  httpCode: 0,
  alertString: '',
  redirectUrl: null,
  eventId: null,
  eventCategory: null,
  transIdDisplay: false,
  retryEnabled: false,
  errorCodeDisplay: false,
  needsAuthoring: true,
} as const;

/** Shared NonProd-and-belongs-to-Application guard for createErrorCode()/addLanguageContent().
 *  Loads and returns the Environment so callers don't need a second query. */
async function requireNonProductionEnvironmentInApplication({
  applicationId,
  environmentId,
}: {
  applicationId: string;
  environmentId: string;
}) {
  const environment = await prisma.environment.findUnique({ where: { id: environmentId } });

  if (!environment || environment.applicationId !== applicationId || environment.isProduction) {
    throw new InvalidEnvironmentError();
  }

  return environment;
}

/**
 * US-3.1 — Manually creates a new error code (ErrorMessage) plus its first, placeholder
 * ErrorContent row, in a NonProd Environment the caller selects.
 *
 * Note: ErrorMessage has no "created by" column in prisma/schema.prisma (unlike Application,
 * which has createdByUserId) — so unlike createApplication(), this intentionally does not
 * accept/store a creating user id. If that's needed later it requires a schema migration, not
 * a made-up field here.
 */
export async function createErrorCode({
  applicationId,
  environmentId,
  code,
  language,
}: {
  applicationId: string;
  environmentId: string;
  code: string;
  language: string;
}): Promise<ErrorMessage> {
  await requireNonProductionEnvironmentInApplication({ applicationId, environmentId });

  const existing = await prisma.errorMessage.findFirst({
    where: { applicationId, code: { equals: code, mode: 'insensitive' } },
  });

  if (existing) {
    throw new DuplicateErrorCodeError(code);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const errorMessage = await tx.errorMessage.create({
        data: { applicationId, code },
      });

      await tx.errorContent.create({
        data: {
          errorMessageId: errorMessage.id,
          environmentId,
          language,
          ...PLACEHOLDER_CONTENT_FIELDS,
        },
      });

      return errorMessage;
    });
  } catch (error) {
    // Defense-in-depth against a race between the pre-check above and the insert, same as
    // createApplication()'s P2002 handling.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DuplicateErrorCodeError(code);
    }
    throw error;
  }
}

const ERROR_MESSAGE_WITH_CONTENTS_INCLUDE = {
  contents: {
    include: { environment: true },
    orderBy: [
      { environment: { isProduction: 'desc' as const } },
      { environment: { name: 'asc' as const } },
      { language: 'asc' as const },
    ],
  },
} satisfies Prisma.ErrorMessageInclude;

export type ErrorMessageWithContents = Prisma.ErrorMessageGetPayload<{
  include: typeof ERROR_MESSAGE_WITH_CONTENTS_INCLUDE;
}>;

/**
 * For the code detail page. Verifies the ErrorMessage actually belongs to applicationId,
 * returning null otherwise (same "existence vs access" split as
 * src/lib/services/applications.ts's getApplicationById() — callers are responsible for
 * calling requireApplicationAccess() before using the result).
 */
export async function getErrorMessageWithContents(
  applicationId: string,
  errorMessageId: string,
): Promise<ErrorMessageWithContents | null> {
  const errorMessage = await prisma.errorMessage.findUnique({
    where: { id: errorMessageId },
    include: ERROR_MESSAGE_WITH_CONTENTS_INCLUDE,
  });

  if (!errorMessage || errorMessage.applicationId !== applicationId) {
    return null;
  }

  return errorMessage;
}

export interface ErrorMessageSummary {
  id: string;
  code: string;
  createdAt: Date;
  updatedAt: Date;
  /** True if any of this code's ErrorContent rows (any language/environment) still has
   *  needsAuthoring: true — drives the Application dashboard's "needs authoring" vs
   *  "authored" split (US-3.1's dashboard, corrected from this page's original
   *  "TODO: US-2.1/2.3" comment, which referenced the wrong epic when first scaffolded). */
  needsAuthoring: boolean;
}

/** For the Application dashboard — every ErrorMessage for the app, plus the computed
 *  needsAuthoring summary above. */
export async function listErrorMessagesForApplication(
  applicationId: string,
): Promise<ErrorMessageSummary[]> {
  const errorMessages = await prisma.errorMessage.findMany({
    where: { applicationId },
    include: {
      contents: { select: { needsAuthoring: true } },
    },
    orderBy: { code: 'asc' },
  });

  return errorMessages.map((errorMessage) => ({
    id: errorMessage.id,
    code: errorMessage.code,
    createdAt: errorMessage.createdAt,
    updatedAt: errorMessage.updatedAt,
    needsAuthoring: errorMessage.contents.some((content) => content.needsAuthoring),
  }));
}

/**
 * US-4.2 — Adds a new, empty/placeholder language row for an existing error code, scoped to
 * one NonProd Environment (content is authored independently per language, never copied from
 * an existing one).
 */
export async function addLanguageContent({
  errorMessageId,
  environmentId,
  language,
}: {
  errorMessageId: string;
  environmentId: string;
  language: string;
}): Promise<ErrorContent> {
  const errorMessage = await prisma.errorMessage.findUnique({ where: { id: errorMessageId } });

  if (!errorMessage) {
    throw new InvalidEnvironmentError('That error code does not exist.');
  }

  await requireNonProductionEnvironmentInApplication({
    applicationId: errorMessage.applicationId,
    environmentId,
  });

  const existing = await prisma.errorContent.findUnique({
    where: {
      errorMessageId_language_environmentId: { errorMessageId, language, environmentId },
    },
  });

  if (existing) {
    throw new DuplicateContentError();
  }

  try {
    return await prisma.errorContent.create({
      data: {
        errorMessageId,
        environmentId,
        language,
        ...PLACEHOLDER_CONTENT_FIELDS,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DuplicateContentError();
    }
    throw error;
  }
}

/** For Server Actions that only receive an errorMessageId and need to resolve the owning
 *  applicationId before calling requireApplicationAccess() (src/actions/errorCodes.ts's
 *  addLanguageAction) — the cross-tenant guard still applies even though the id shape isn't
 *  applicationId directly. Returns null if the code doesn't exist. */
export async function getApplicationIdForErrorMessage(
  errorMessageId: string,
): Promise<string | null> {
  const errorMessage = await prisma.errorMessage.findUnique({
    where: { id: errorMessageId },
    select: { applicationId: true },
  });

  return errorMessage?.applicationId ?? null;
}

/** Same purpose as getApplicationIdForErrorMessage() above, but for Server Actions that only
 *  receive an errorContentId (src/actions/errorCodes.ts's updateErrorContentAction). Also
 *  returns the owning errorMessageId, since that's the id the code detail page is keyed on and
 *  callers need it to revalidatePath() the right page. Returns null if the row doesn't exist. */
export async function getErrorContentOwnership(
  errorContentId: string,
): Promise<{ applicationId: string; errorMessageId: string } | null> {
  const content = await prisma.errorContent.findUnique({
    where: { id: errorContentId },
    select: { errorMessageId: true, errorMessage: { select: { applicationId: true } } },
  });

  if (!content) {
    return null;
  }

  return {
    applicationId: content.errorMessage.applicationId,
    errorMessageId: content.errorMessageId,
  };
}

/**
 * US-4.1/4.3 — Edits a code's metadata/content for one (language, environment) row. Hard
 * blocks Prod edits (ProductionContentNotEditableError) — Epic 6's promotion flow is the only
 * path into Prod content, not built yet. Clears needsAuthoring on save, per
 * management-ui-backlog.md ("needsAuthoring cleared on first save").
 */
export async function updateErrorContent({
  errorContentId,
  header,
  description,
  friendlyMessage,
  category,
  errorCategory,
  httpCode,
  alertString,
  redirectUrl,
  eventId,
  eventCategory,
  transIdDisplay,
  retryEnabled,
  errorCodeDisplay,
}: {
  errorContentId: string;
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
}): Promise<ErrorContent> {
  const existing = await prisma.errorContent.findUnique({
    where: { id: errorContentId },
    include: { environment: true },
  });

  if (!existing) {
    throw new Error('That content row does not exist.');
  }

  if (existing.environment.isProduction) {
    throw new ProductionContentNotEditableError();
  }

  return prisma.errorContent.update({
    where: { id: errorContentId },
    data: {
      header,
      description,
      friendlyMessage,
      category,
      errorCategory,
      httpCode,
      alertString,
      redirectUrl,
      eventId,
      eventCategory,
      transIdDisplay,
      retryEnabled,
      errorCodeDisplay,
      needsAuthoring: false,
    },
  });
}
