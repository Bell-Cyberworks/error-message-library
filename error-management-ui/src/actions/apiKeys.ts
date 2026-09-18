'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth/options';
import { requireApplicationAccess, requireRole, UnauthorizedError } from '@/lib/auth/rbac';
import {
  createApplicationApiKey,
  revokeApplicationApiKey,
  createSystemApiKey,
  revokeSystemApiKey,
  DuplicateApiKeyNameError,
  ApiKeyNotFoundError,
} from '@/lib/services/apiKeys';
import {
  createApplicationApiKeySchema,
  revokeApplicationApiKeySchema,
  createSystemApiKeySchema,
  revokeSystemApiKeySchema,
} from '@/lib/validation/apiKeys';
import type { ActionResult } from '@/lib/actions/result';

// Server Actions for API key management. Same shape as src/actions/applications.ts: auth() +
// the relevant RBAC guard, zod validate, call the matching src/lib/services/apiKeys.ts
// function, revalidatePath the affected page(s), typed service errors become a field/form
// ActionResult error, anything unexpected is rethrown.

// Per-Application keys: any Application Admin assigned to the Application (or an Admin) can
// manage its keys — same access level as everything else scoped to one Application
// (requireApplicationAccess(), not requireRole('ADMIN')).

export async function createApplicationApiKeyAction(
  _prevState: ActionResult<{ rawKey: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ rawKey: string }>> {
  const session = await auth();

  const applicationId = formData.get('applicationId');
  if (typeof applicationId !== 'string' || !applicationId) {
    return { success: false, error: 'Invalid request.' };
  }

  await requireApplicationAccess(session, applicationId);

  if (!session?.user) {
    // Unreachable in practice — requireApplicationAccess() above already throws
    // UnauthorizedError when there's no session. requireApplicationAccess() is async (unlike
    // requireRole()'s synchronous `asserts session is Session`), so TypeScript can't narrow
    // `session` across the await; this satisfies that without a non-null assertion.
    throw new UnauthorizedError();
  }

  const parsed = createApplicationApiKeySchema.safeParse({
    applicationId,
    name: formData.get('name'),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  let rawKey: string;
  try {
    const created = await createApplicationApiKey({
      applicationId: parsed.data.applicationId,
      name: parsed.data.name,
      createdByUserId: session.user.id,
    });
    rawKey = created.rawKey;
  } catch (error) {
    if (error instanceof DuplicateApiKeyNameError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  revalidatePath(`/applications/${applicationId}/api-keys`);
  return { success: true, rawKey };
}

export async function revokeApplicationApiKeyAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();

  const applicationId = formData.get('applicationId');
  if (typeof applicationId !== 'string' || !applicationId) {
    return { success: false, error: 'Invalid request.' };
  }

  await requireApplicationAccess(session, applicationId);

  const parsed = revokeApplicationApiKeySchema.safeParse({
    applicationId,
    id: formData.get('id'),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  try {
    await revokeApplicationApiKey(parsed.data);
  } catch (error) {
    // Already revoked/removed (e.g. a double-click race) — treat as a no-op rather than
    // surfacing a stale error, same as removeApplicationAdminAction()'s handling of
    // AssignmentNotFoundError.
    if (!(error instanceof ApiKeyNotFoundError)) {
      throw error;
    }
  }

  revalidatePath(`/applications/${parsed.data.applicationId}/api-keys`);
  return { success: true };
}

// System keys: cross-Application privilege, same access level as Application registration
// itself (requireRole('ADMIN')).

export async function createSystemApiKeyAction(
  _prevState: ActionResult<{ rawKey: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ rawKey: string }>> {
  const session = await auth();
  requireRole(session, 'ADMIN');

  const parsed = createSystemApiKeySchema.safeParse({
    name: formData.get('name'),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  let rawKey: string;
  try {
    const created = await createSystemApiKey({
      name: parsed.data.name,
      createdByUserId: session.user.id,
    });
    rawKey = created.rawKey;
  } catch (error) {
    if (error instanceof DuplicateApiKeyNameError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  revalidatePath('/system-api-keys');
  return { success: true, rawKey };
}

export async function revokeSystemApiKeyAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  requireRole(session, 'ADMIN');

  const parsed = revokeSystemApiKeySchema.safeParse({
    id: formData.get('id'),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  try {
    await revokeSystemApiKey(parsed.data.id);
  } catch (error) {
    if (!(error instanceof ApiKeyNotFoundError)) {
      throw error;
    }
  }

  revalidatePath('/system-api-keys');
  return { success: true };
}
