'use client';

import { useActionState } from 'react';
import { createApplicationApiKeyAction } from '@/actions/apiKeys';
import type { ActionResult } from '@/lib/actions/result';

const initialState: ActionResult<{ rawKey: string }> | null = null;

// Creates a per-Application API key for the public lookup endpoint
// (src/app/api/v1/lookup/route.ts). On success, the raw key is only ever returned this one
// time — createApplicationApiKey() (src/lib/services/apiKeys.ts) never stores or re-returns
// it — so it's rendered here in a deliberately hard-to-miss way (a labeled warning region plus
// a <pre> block) rather than folded into the same quiet `role="status"` confirmation the rest
// of this codebase's forms use (e.g. CreateApplicationForm). No CSS/UI library exists in this
// scaffold yet (see src/app/globals.css) — the emphasis here is semantic markup, not styling.
export function CreateApplicationApiKeyForm({ applicationId }: { applicationId: string }) {
  const [state, formAction, isPending] = useActionState(
    createApplicationApiKeyAction,
    initialState,
  );

  return (
    <form action={formAction}>
      <h3>Create API key</h3>
      <input type="hidden" name="applicationId" value={applicationId} />
      <div>
        <label htmlFor="api-key-name">Name</label>
        <br />
        <input id="api-key-name" name="name" type="text" required maxLength={200} />
      </div>
      {state && !state.success ? (
        <p role="alert" aria-live="assertive">
          {state.error}
        </p>
      ) : null}
      {state?.success ? (
        <div role="alert" aria-live="assertive">
          <p>
            <strong>Copy this API key now — it will never be shown again.</strong> It is not
            stored anywhere in a recoverable form; if you lose it, you will need to revoke this
            key and create a new one.
          </p>
          <pre>
            <code>{state.rawKey}</code>
          </pre>
        </div>
      ) : null}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating…' : 'Create API key'}
      </button>
    </form>
  );
}
