'use client';

import { useActionState } from 'react';
import { createApplicationAction } from '@/actions/applications';
import type { ActionResult } from '@/lib/actions/result';

const initialState: ActionResult | null = null;

// US-2.1 — Register Application form (Admin only; only rendered by the applications page for
// ADMIN sessions, but createApplicationAction() re-checks the role server-side regardless).
export function CreateApplicationForm() {
  const [state, formAction, isPending] = useActionState(createApplicationAction, initialState);

  return (
    <form action={formAction}>
      <h2>Register Application</h2>
      <div>
        <label htmlFor="application-name">Name</label>
        <br />
        <input id="application-name" name="name" type="text" required maxLength={200} />
      </div>
      {state && !state.success ? (
        <p role="alert" aria-live="assertive">
          {state.error}
        </p>
      ) : null}
      {state?.success ? <p role="status">Application registered.</p> : null}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Registering…' : 'Register Application'}
      </button>
    </form>
  );
}
