'use client';

import { useActionState } from 'react';
import { createApplicationAdminAction } from '@/actions/users';
import type { ActionResult } from '@/lib/actions/result';

const initialState: ActionResult | null = null;

// US-2.2 — Create an Application Admin account form (Admin only). Admins set the initial
// password directly (this repo's resolved decision: no self-signup/invite flow in v1).
export function CreateApplicationAdminForm() {
  const [state, formAction, isPending] = useActionState(
    createApplicationAdminAction,
    initialState,
  );

  return (
    <form action={formAction}>
      <div>
        <label htmlFor="admin-email">Email</label>
        <br />
        <input id="admin-email" name="email" type="email" autoComplete="off" required />
      </div>
      <div>
        <label htmlFor="admin-name">Name</label>
        <br />
        <input id="admin-name" name="name" type="text" required maxLength={200} />
      </div>
      <div>
        <label htmlFor="admin-password">Initial password</label>
        <br />
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
        />
      </div>
      {state && !state.success ? (
        <p role="alert" aria-live="assertive">
          {state.error}
        </p>
      ) : null}
      {state?.success ? <p role="status">Application Admin account created.</p> : null}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating…' : 'Create Application Admin'}
      </button>
    </form>
  );
}
