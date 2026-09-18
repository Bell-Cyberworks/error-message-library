'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth/options';
import { requireApplicationAccess } from '@/lib/auth/rbac';
import {
  createErrorCode,
  addLanguageContent,
  updateErrorContent,
  getApplicationIdForErrorMessage,
  getErrorContentOwnership,
  DuplicateErrorCodeError,
  InvalidEnvironmentError,
  DuplicateContentError,
  ProductionContentNotEditableError,
} from '@/lib/services/errorCodes';
import {
  createErrorCodeSchema,
  addLanguageSchema,
  updateErrorContentSchema,
} from '@/lib/validation/errorCodes';
import type { ActionResult } from '@/lib/actions/result';

// Epic 3/4 Server Actions. Same shape as src/actions/applications.ts: auth() +
// requireApplicationAccess() (not requireRole('ADMIN') — Application Admins author their own
// codes, per src/lib/auth/rbac.ts), zod validate, call the matching
// src/lib/services/errorCodes.ts function, revalidatePath the affected page(s), typed service
// errors become a field/form ActionResult error, anything unexpected is rethrown.
//
// For actions keyed on an errorMessageId/errorContentId rather than an applicationId
// directly, the owning applicationId is looked up first (getApplicationIdForErrorMessage /
// getErrorContentOwnership) so the access check still runs — never skipped just because the
// id shape differs.

// US-3.1 — Manually create a new error code in a NonProd environment. Redirects straight to
// the new code's detail page on success rather than returning an ActionResult, so the caller
// (src/app/(admin)/applications/[applicationId]/codes/new/page.tsx) always has an obvious next
// step.
export async function createErrorCodeAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();

  const applicationId = formData.get('applicationId');
  if (typeof applicationId !== 'string' || !applicationId) {
    return { success: false, error: 'Invalid request.' };
  }

  await requireApplicationAccess(session, applicationId);

  const parsed = createErrorCodeSchema.safeParse({
    applicationId,
    environmentId: formData.get('environmentId'),
    code: formData.get('code'),
    language: formData.get('language'),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  let newErrorMessageId: string;
  try {
    const errorMessage = await createErrorCode(parsed.data);
    newErrorMessageId = errorMessage.id;
  } catch (error) {
    if (error instanceof DuplicateErrorCodeError || error instanceof InvalidEnvironmentError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  revalidatePath(`/applications/${applicationId}`);
  redirect(`/applications/${applicationId}/codes/${newErrorMessageId}`);
}

// US-4.2 — Add a language to an existing error code, scoped to one NonProd environment.
export async function addLanguageAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();

  const errorMessageId = formData.get('errorMessageId');
  if (typeof errorMessageId !== 'string' || !errorMessageId) {
    return { success: false, error: 'Invalid request.' };
  }

  const applicationId = await getApplicationIdForErrorMessage(errorMessageId);
  if (!applicationId) {
    return { success: false, error: 'That error code does not exist.' };
  }

  await requireApplicationAccess(session, applicationId);

  const parsed = addLanguageSchema.safeParse({
    errorMessageId,
    environmentId: formData.get('environmentId'),
    language: formData.get('language'),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  try {
    await addLanguageContent(parsed.data);
  } catch (error) {
    if (error instanceof DuplicateContentError || error instanceof InvalidEnvironmentError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  revalidatePath(`/applications/${applicationId}/codes/${errorMessageId}`);
  return { success: true };
}

/** Native checkbox inputs are absent from FormData entirely when unchecked (never "false") —
 *  normalize that to a boolean before validation ever sees it. */
function checkboxValue(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on';
}

/** formData.get() returns null for a missing field; normalize to undefined so zod's
 *  `.optional()` (rather than a type error) handles it. */
function optionalStringValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' ? value : undefined;
}

// US-4.1/4.3 — Edit a code's metadata/content for one (language, environment) row. NonProd
// only — updateErrorContent() hard-blocks Prod rows (ProductionContentNotEditableError),
// since Epic 6's promotion flow is the only path into Prod content and isn't built yet.
export async function updateErrorContentAction(
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

  const parsed = updateErrorContentSchema.safeParse({
    errorContentId,
    header: optionalStringValue(formData, 'header'),
    description: optionalStringValue(formData, 'description'),
    friendlyMessage: optionalStringValue(formData, 'friendlyMessage'),
    category: optionalStringValue(formData, 'category'),
    errorCategory: optionalStringValue(formData, 'errorCategory'),
    httpCode: optionalStringValue(formData, 'httpCode'),
    alertString: optionalStringValue(formData, 'alertString'),
    redirectUrl: optionalStringValue(formData, 'redirectUrl'),
    eventId: optionalStringValue(formData, 'eventId'),
    eventCategory: optionalStringValue(formData, 'eventCategory'),
    transIdDisplay: checkboxValue(formData, 'transIdDisplay'),
    retryEnabled: checkboxValue(formData, 'retryEnabled'),
    errorCodeDisplay: checkboxValue(formData, 'errorCodeDisplay'),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  try {
    await updateErrorContent(parsed.data);
  } catch (error) {
    if (error instanceof ProductionContentNotEditableError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  revalidatePath(`/applications/${ownership.applicationId}/codes/${ownership.errorMessageId}`);
  return { success: true };
}
