'use client';

import { useActionState } from 'react';
import { assignApplicationAdminAction } from '@/actions/applications';
import type { ActionResult } from '@/lib/actions/result';

const initialState: ActionResult | null = null;

interface EligibleUser {
  id: string;
  name: string | null;
  email: string;
}

// US-2.3 — Assign an existing APPLICATION_ADMIN-role user (not already assigned) to this
// Application. `eligibleUsers` is pre-filtered server-side by the admins page.
export function AssignApplicationAdminForm({
  applicationId,
  eligibleUsers,
}: {
  applicationId: string;
  eligibleUsers: EligibleUser[];
}) {
  const [state, formAction, isPending] = useActionState(
    assignApplicationAdminAction,
    initialState,
  );

  if (eligibleUsers.length === 0) {
    return (
      <p>
        No unassigned Application Admin accounts are available. Create one on the Users page.
      </p>
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <div>
        <label htmlFor="assign-user">Application Admin</label>
        <br />
        <select id="assign-user" name="userId" required defaultValue="">
          <option value="" disabled>
            Select a user…
          </option>
          {eligibleUsers.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name ? `${user.name} (${user.email})` : user.email}
            </option>
          ))}
        </select>
      </div>
      {state && !state.success ? (
        <p role="alert" aria-live="assertive">
          {state.error}
        </p>
      ) : null}
      {state?.success ? <p role="status">Application Admin assigned.</p> : null}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Assigning…' : 'Assign'}
      </button>
    </form>
  );
}
