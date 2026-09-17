'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth/options';
import { requireRole } from '@/lib/auth/rbac';
import {
  createApplication,
  assignApplicationAdmin,
  removeApplicationAdmin,
  DuplicateApplicationError,
  ApplicationAdminAlreadyAssignedError,
  InvalidAssignmentTargetError,
  AssignmentNotFoundError,
} from '@/lib/services/applications';
import {
  createApplicationSchema,
  assignApplicationAdminSchema,
} from '@/lib/validation/applications';
import type { ActionResult } from '@/lib/actions/result';

// Epic 2 Server Actions for Applications. Each action: gets the session, enforces RBAC via
// src/lib/auth/rbac.ts (never trust the form being hidden — US-7.1/7.2), validates input,
// calls the matching src/lib/services/applications.ts function, revalidates the affected
// page(s), and returns an ActionResult the calling form can render. Typed service errors are
// caught and turned into a field/form error; anything unexpected (including
// UnauthorizedError/ForbiddenError from requireRole) is rethrown rather than swallowed.

// US-2.1 — Register an Application (Admin only).
export async function createApplicationAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  requireRole(session, 'ADMIN');

  const parsed = createApplicationSchema.safeParse({
    name: formData.get('name'),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  try {
    await createApplication({ name: parsed.data.name, createdByUserId: session.user.id });
  } catch (error) {
    if (error instanceof DuplicateApplicationError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  revalidatePath('/applications');
  return { success: true };
}

// US-2.3 — Assign an Application Admin to an Application (Admin only).
export async function assignApplicationAdminAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  requireRole(session, 'ADMIN');

  const parsed = assignApplicationAdminSchema.safeParse({
    applicationId: formData.get('applicationId'),
    userId: formData.get('userId'),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  try {
    await assignApplicationAdmin({
      applicationId: parsed.data.applicationId,
      userId: parsed.data.userId,
      assignedByUserId: session.user.id,
    });
  } catch (error) {
    if (
      error instanceof ApplicationAdminAlreadyAssignedError ||
      error instanceof InvalidAssignmentTargetError
    ) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  revalidatePath(`/applications/${parsed.data.applicationId}/admins`);
  revalidatePath('/applications');
  return { success: true };
}

// US-2.3 — Remove an Application Admin assignment (Admin only).
export async function removeApplicationAdminAction(formData: FormData): Promise<ActionResult> {
  const session = await auth();
  requireRole(session, 'ADMIN');

  const applicationId = formData.get('applicationId');
  const userId = formData.get('userId');

  if (
    typeof applicationId !== 'string' ||
    typeof userId !== 'string' ||
    !applicationId ||
    !userId
  ) {
    return { success: false, error: 'Invalid request.' };
  }

  try {
    await removeApplicationAdmin({ applicationId, userId });
  } catch (error) {
    // Already removed (e.g. a double-click race) — treat as a no-op rather than surfacing a
    // stale error, since the end state the user wanted (not assigned) is already true.
    if (!(error instanceof AssignmentNotFoundError)) {
      throw error;
    }
  }

  revalidatePath(`/applications/${applicationId}/admins`);
  revalidatePath('/applications');
  return { success: true };
}
