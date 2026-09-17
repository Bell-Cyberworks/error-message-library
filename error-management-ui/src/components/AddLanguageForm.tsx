'use client';

import { useActionState } from 'react';
import { addLanguageAction } from '@/actions/errorCodes';
import type { ActionResult } from '@/lib/actions/result';

const initialState: ActionResult | null = null;

interface AvailableLanguage {
  code: string;
  label: string;
}

// US-4.2 — Add a language to this code, scoped to one NonProd environment.
// `availableLanguages` is pre-filtered by the code detail page (src/app/(admin)/applications/
// [applicationId]/codes/[codeId]/page.tsx) to exclude languages this environment already has
// content for, so this dropdown can never offer a duplicate.
export function AddLanguageForm({
  errorMessageId,
  environmentId,
  availableLanguages,
}: {
  errorMessageId: string;
  environmentId: string;
  availableLanguages: AvailableLanguage[];
}) {
  const [state, formAction, isPending] = useActionState(addLanguageAction, initialState);

  if (availableLanguages.length === 0) {
    return <p>All supported languages already have content in this environment.</p>;
  }

  const selectId = `add-language-${environmentId}`;

  return (
    <form action={formAction}>
      <input type="hidden" name="errorMessageId" value={errorMessageId} />
      <input type="hidden" name="environmentId" value={environmentId} />
      <label htmlFor={selectId}>Add language</label>
      <br />
      <select id={selectId} name="language" required defaultValue="">
        <option value="" disabled>
          Select a language…
        </option>
        {availableLanguages.map((language) => (
          <option key={language.code} value={language.code}>
            {language.label}
          </option>
        ))}
      </select>{' '}
      <button type="submit" disabled={isPending}>
        {isPending ? 'Adding…' : 'Add'}
      </button>
      {state && !state.success ? (
        <p role="alert" aria-live="assertive">
          {state.error}
        </p>
      ) : null}
      {state?.success ? <p role="status">Language added.</p> : null}
    </form>
  );
}
