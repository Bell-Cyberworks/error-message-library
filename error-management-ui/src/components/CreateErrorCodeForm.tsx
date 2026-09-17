'use client';

import { useActionState } from 'react';
import { createErrorCodeAction } from '@/actions/errorCodes';
import { LANGUAGES } from '@/lib/constants/languages';
import type { ActionResult } from '@/lib/actions/result';

const initialState: ActionResult | null = null;

interface NonProdEnvironment {
  id: string;
  name: string;
}

// US-3.1 — Manually create a new error code, in a NonProd environment the Application Admin
// selects. On success, createErrorCodeAction() redirects straight to the new code's detail
// page (see src/actions/errorCodes.ts) rather than returning a success ActionResult, so only
// the error path ever actually renders from this form's state.
export function CreateErrorCodeForm({
  applicationId,
  environments,
}: {
  applicationId: string;
  environments: NonProdEnvironment[];
}) {
  const [state, formAction, isPending] = useActionState(createErrorCodeAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="applicationId" value={applicationId} />
      <div>
        <label htmlFor="error-code">Code</label>
        <br />
        <input
          id="error-code"
          name="code"
          type="text"
          required
          maxLength={100}
          pattern="[A-Za-z0-9_.\-]+"
          title={'Letters, numbers, "_", "-", and "." only, no spaces.'}
        />
      </div>
      <div>
        <label htmlFor="error-code-environment">Environment</label>
        <br />
        <select id="error-code-environment" name="environmentId" required defaultValue="">
          <option value="" disabled>
            Select an environment…
          </option>
          {environments.map((environment) => (
            <option key={environment.id} value={environment.id}>
              {environment.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="error-code-language">Language</label>
        <br />
        <select id="error-code-language" name="language" required defaultValue="en">
          {LANGUAGES.map((language) => (
            <option key={language.code} value={language.code}>
              {language.label}
            </option>
          ))}
        </select>
      </div>
      {state && !state.success ? (
        <p role="alert" aria-live="assertive">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Creating…' : 'Create error code'}
      </button>
    </form>
  );
}
