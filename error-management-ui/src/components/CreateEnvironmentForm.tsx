'use client';

import { useActionState } from 'react';
import { createEnvironmentAction } from '@/actions/environments';
import type { ActionResult } from '@/lib/actions/result';

const initialState: ActionResult | null = null;

// Epic 5 (US-5.1, extended — see the environments page for the scope-deviation note) — Create
// a NonProd Environment form. Available to any user with access to the Application (not
// Admin-only); createEnvironmentAction() re-checks access server-side regardless.
export function CreateEnvironmentForm({ applicationId }: { applicationId: string }) {
  const [state, formAction, isPending] = useActionState(createEnvironmentAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <h2>New NonProd Environment</h2>
      <div>
        <label htmlFor="environment-name">Name</label>
        <br />
        <input id="environment-name" name="name" type="text" required maxLength={100} />
      </div>
      {state && !state.success ? (
        <p role="alert" aria-live="assertive">
          {state.error}
        </p>
      ) : null}
      {state?.success ? <p role="status">Environment created.</p> : null}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating…' : 'Create Environment'}
      </button>
    </form>
  );
}
