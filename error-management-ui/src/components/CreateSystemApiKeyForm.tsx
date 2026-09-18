'use client';

import { useActionState } from 'react';
import { createSystemApiKeyAction } from '@/actions/apiKeys';
import type { ActionResult } from '@/lib/actions/result';

const initialState: ActionResult<{ rawKey: string }> | null = null;

// System-level API key for the public lookup endpoint (src/app/api/v1/lookup/route.ts) —
// cross-Application read/lookup access, for trusted internal callers (Error UI) that can't
// hold one Application's key ahead of time. Same one-time-raw-key display treatment as
// CreateApplicationApiKeyForm.
export function CreateSystemApiKeyForm() {
  const [state, formAction, isPending] = useActionState(createSystemApiKeyAction, initialState);

  return (
    <form action={formAction}>
      <h3>Create system API key</h3>
      <div>
        <label htmlFor="system-api-key-name">Name</label>
        <br />
        <input id="system-api-key-name" name="name" type="text" required maxLength={200} />
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
