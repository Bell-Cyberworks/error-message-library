'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth/options';
import { requireApplicationAccess } from '@/lib/auth/rbac';
import { createEnvironment, DuplicateEnvironmentNameError } from '@/lib/services/environments';
import { createEnvironmentSchema } from '@/lib/validation/environments';
import type { ActionResult } from '@/lib/actions/result';

// Epic 5 Server Action. Deviation from the backlog as written (flagged in this task's
// report): US-5.1 only says "view and select" environments, but nothing in Epics 1-2 ever
// creates a NonProd Environment, which blocks Epic 3 entirely (US-3.1 requires picking an
// existing one) — so creation is added here too.
//
// Any user with access to the Application may create a NonProd Environment (not Admin-only)
// — an Application Admin owns their own Environments, unlike Application-Admin *assignment*
// (src/actions/applications.ts), which really is Admin-only per the backlog.
export async function createEnvironmentAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();

  const applicationId = formData.get('applicationId');
  if (typeof applicationId !== 'string' || !applicationId) {
    return { success: false, error: 'Invalid request.' };
  }

  await requireApplicationAccess(session, applicationId);

  const parsed = createEnvironmentSchema.safeParse({
    applicationId,
    name: formData.get('name'),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  try {
    await createEnvironment(parsed.data);
  } catch (error) {
    if (error instanceof DuplicateEnvironmentNameError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  revalidatePath(`/applications/${applicationId}/environments`);
  revalidatePath(`/applications/${applicationId}/codes/new`);
  revalidatePath(`/applications/${applicationId}`);
  return { success: true };
}
