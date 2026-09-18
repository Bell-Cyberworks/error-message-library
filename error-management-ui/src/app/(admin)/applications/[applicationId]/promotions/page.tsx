import Link from 'next/link';
import { auth } from '@/lib/auth/options';
import { requireApplicationAccess, ForbiddenError, UnauthorizedError } from '@/lib/auth/rbac';
import {
  listPendingPromotionsForApplication,
  listPromotionHistoryForApplication,
  type ContentSnapshot,
} from '@/lib/services/promotions';
import { getLanguageLabel } from '@/lib/constants/languages';
import { PromotionReviewControls } from '@/components/PromotionReviewControls';

// US-6.2/6.3/6.4/6.5 — Pending promotion review queue plus the read-only, all-statuses audit
// trail (docs/environments-and-promotion.md's "Review & approve/reject" / "Audit trail"
// steps). Approve/reject controls are only rendered for a request the viewing session did NOT
// submit — the submitter-≠-approver rule is enforced server-side regardless (see
// src/lib/services/promotions.ts's SelfReviewError and the DB's
// PromotionRequest_submitter_not_reviewer_check); this is just the UI's reflection of it.
export default async function ApplicationPromotionsPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const session = await auth();

  try {
    await requireApplicationAccess(session, applicationId);
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return (
        <section>
          <h1>Access denied</h1>
          <p role="alert">{error.message}</p>
        </section>
      );
    }
    throw error;
  }

  const [pending, history] = await Promise.all([
    listPendingPromotionsForApplication(applicationId),
    listPromotionHistoryForApplication(applicationId),
  ]);

  const currentUserId = session?.user?.id;

  return (
    <section>
      <h1>Promotions</h1>
      <p>
        <Link href={`/applications/${applicationId}`}>Back to Application</Link>
      </p>

      <h2>Pending review</h2>
      {pending.length === 0 ? (
        <p>No promotion requests are pending review.</p>
      ) : (
        <ul>
          {pending.map((request) => {
            const snapshot = request.contentSnapshot as unknown as ContentSnapshot;
            const isSubmitter = request.submittedByUserId === currentUserId;

            return (
              <li key={request.id}>
                <p>
                  <strong>{request.errorMessage.code}</strong> —{' '}
                  {getLanguageLabel(request.language)}
                  <br />
                  {request.sourceEnvironment.name} → {request.targetEnvironment.name}
                </p>
                <p>
                  Submitted by {request.submittedBy.name ?? request.submittedBy.email} on{' '}
                  {request.submittedAt.toLocaleString()}
                </p>
                <p>
                  <em>Header:</em> {snapshot.header}
                  <br />
                  <em>Description:</em> {snapshot.description}
                </p>

                {isSubmitter ? (
                  <p>You submitted this — another Application Admin or Admin must review it.</p>
                ) : (
                  <PromotionReviewControls promotionRequestId={request.id} />
                )}
              </li>
            );
          })}
        </ul>
      )}

      <h2>History</h2>
      {history.length === 0 ? (
        <p>No promotion requests yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Code</th>
              <th scope="col">Language</th>
              <th scope="col">Source</th>
              <th scope="col">Target</th>
              <th scope="col">Status</th>
              <th scope="col">Submitted by</th>
              <th scope="col">Submitted at</th>
              <th scope="col">Reviewed by</th>
              <th scope="col">Reviewed at</th>
              <th scope="col">Rejection reason</th>
            </tr>
          </thead>
          <tbody>
            {history.map((request) => (
              <tr key={request.id}>
                <td>{request.errorMessage.code}</td>
                <td>{getLanguageLabel(request.language)}</td>
                <td>{request.sourceEnvironment.name}</td>
                <td>{request.targetEnvironment.name}</td>
                <td>{request.status}</td>
                <td>{request.submittedBy.name ?? request.submittedBy.email}</td>
                <td>{request.submittedAt.toLocaleString()}</td>
                <td>
                  {request.reviewedBy
                    ? (request.reviewedBy.name ?? request.reviewedBy.email)
                    : '—'}
                </td>
                <td>{request.reviewedAt ? request.reviewedAt.toLocaleString() : '—'}</td>
                <td>{request.rejectionReason ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
