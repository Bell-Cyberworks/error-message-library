'use client';

import { useActionState } from 'react';
import { submitPromotionAction } from '@/actions/promotions';
import type { ActionResult } from '@/lib/actions/result';

const initialState: ActionResult | null = null;

// US-6.1 — Submit one NonProd (language, environment) content row for promotion to Prod. Only
// rendered by the code detail page (src/app/(admin)/applications/[applicationId]/codes/
// [codeId]/page.tsx) when there isn't already a PENDING request for this row's
// (language, targetEnvironment=Prod) — see
// src/lib/services/promotions.ts's listPendingPromotionsForErrorMessage().
export function SubmitPromotionForm({ errorContentId }: { errorContentId: string }) {
  const [state, formAction, isPending] = useActionState(submitPromotionAction, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="errorContentId" value={errorContentId} />
      <button type="submit" disabled={isPending}>
        {isPending ? 'Submitting…' : 'Submit for promotion'}
      </button>
      {state && !state.success ? (
        <p role="alert" aria-live="assertive">
          {state.error}
        </p>
      ) : null}
      {state?.success ? <p role="status">Submitted for promotion.</p> : null}
    </form>
  );
}
