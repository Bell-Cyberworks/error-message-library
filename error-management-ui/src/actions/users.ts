'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/lib/auth/options';
import { requireRole } from '@/lib/auth/rbac';
import { createApplicationAdminUser, DuplicateUserEmailError } from '@/lib/services/users';
import { createApplicationAdminSchema } from '@/lib/validation/applications';
import type { ActionResult } from '@/lib/actions/result';

// US-2.2 — Create an Application Admin account (Admin only). See
// src/actions/applications.ts for the shared RBAC/typed-error/ActionResult pattern.
export async function createApplicationAdminAction(
  _prevState: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const session = await auth();
  requireRole(session, 'ADMIN');

  const parsed = createApplicationAdminSchema.safeParse({
    email: formData.get('email'),
    name: formData.get('name'),
    password: formData.get('password'),
  });

  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  }

  try {
    await createApplicationAdminUser(parsed.data);
  } catch (error) {
    if (error instanceof DuplicateUserEmailError) {
      return { success: false, error: error.message };
    }
    throw error;
  }

  revalidatePath('/users');
  return { success: true };
}
