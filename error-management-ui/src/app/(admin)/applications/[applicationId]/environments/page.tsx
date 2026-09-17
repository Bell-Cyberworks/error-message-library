import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth/options';
import { requireApplicationAccess, ForbiddenError, UnauthorizedError } from '@/lib/auth/rbac';
import { getApplicationById } from '@/lib/services/applications';
import { listEnvironmentsForApplication } from '@/lib/services/environments';
import { CreateEnvironmentForm } from '@/components/CreateEnvironmentForm';

// US-5.1 — View and select this Application's environments (selecting Prod on the code detail
// page shows content read-only; see src/app/(admin)/applications/[applicationId]/codes/
// [codeId]/page.tsx).
//
// Scope deviation, flagged per this task's instructions: the backlog's US-5.1 as written only
// says "view and select" — it does not mention creating an environment. But nothing in
// Epics 1-2 ever creates a NonProd Environment (Application registration only auto-creates the
// initial Prod one), which blocks Epic 3 entirely (US-3.1 requires picking an *existing*
// NonProd environment to author into). So a "New NonProd Environment" creation form is added
// to this page to unblock Epic 3 — this is scope added beyond US-5.1's literal text, not a
// silent expansion.
//
// Available to any user with access to this Application (not Admin-only) — an Application
// Admin owns their own Environments, unlike Application-Admin *assignment*
// (src/app/(admin)/applications/[applicationId]/admins/page.tsx), which really is Admin-only
// per the backlog.
export default async function ApplicationEnvironmentsPage({
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

  const application = await getApplicationById(applicationId);

  if (!application) {
    notFound();
  }

  const environments = await listEnvironmentsForApplication(applicationId);

  return (
    <section>
      <h1>Environments — {application.name}</h1>
      <p>
        <Link href={`/applications/${applicationId}`}>Back to Application</Link>
      </p>

      {environments.length === 0 ? (
        <p>No Environments yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Type</th>
            </tr>
          </thead>
          <tbody>
            {environments.map((environment) => (
              <tr key={environment.id}>
                <td>{environment.name}</td>
                <td>{environment.isProduction ? 'Production' : 'NonProd'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <CreateEnvironmentForm applicationId={applicationId} />
    </section>
  );
}
