'use client';

import { useActionState } from 'react';
import { approvePromotionAction, rejectPromotionAction } from '@/actions/promotions';
import type { ActionResult } from '@/lib/actions/result';

const initialState: ActionResult | null = null;

// US-6.2/6.3/6.4 — Approve/reject controls for one pending PromotionRequest. Only rendered by
// the promotions page (src/app/(admin)/applications/[applicationId]/promotions/page.tsx) when
// the viewing session did NOT submit the request — "Approve/reject only enabled for users who
// aren't the submitter" (management-ui-backlog.md). That's a UI nudge only; the actual
// submitter-≠-approver enforcement is server-side (src/lib/services/promotions.ts's
// SelfReviewError, backed by the DB's PromotionRequest_submitter_not_reviewer_check).
export function PromotionReviewControls({ promotionRequestId }: { promotionRequestId: string }) {
  const [approveState, approveAction, isApproving] = useActionState(
    approvePromotionAction,
    initialState,
  );
  const [rejectState, rejectAction, isRejecting] = useActionState(
    rejectPromotionAction,
    initialState,
  );

  const reasonId = `rejection-reason-${promotionRequestId}`;
  const busy = isApproving || isRejecting;

  return (
    <div>
      <form action={approveAction}>
        <input type="hidden" name="promotionRequestId" value={promotionRequestId} />
        <button type="submit" disabled={busy}>
          {isApproving ? 'Approving…' : 'Approve'}
        </button>
        {approveState && !approveState.success ? (
          <p role="alert" aria-live="assertive">
            {approveState.error}
          </p>
        ) : null}
        {approveState?.success ? <p role="status">Approved.</p> : null}
      </form>

      <form action={rejectAction}>
        <input type="hidden" name="promotionRequestId" value={promotionRequestId} />
        <div>
          <label htmlFor={reasonId}>Rejection reason</label>
          <br />
          <textarea id={reasonId} name="rejectionReason" required maxLength={1000} />
        </div>
        <button type="submit" disabled={busy}>
          {isRejecting ? 'Rejecting…' : 'Reject'}
        </button>
        {rejectState && !rejectState.success ? (
          <p role="alert" aria-live="assertive">
            {rejectState.error}
          </p>
        ) : null}
        {rejectState?.success ? <p role="status">Rejected.</p> : null}
      </form>
    </div>
  );
}
