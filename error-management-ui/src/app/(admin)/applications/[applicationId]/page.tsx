import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth/options';
import { requireApplicationAccess, ForbiddenError, UnauthorizedError } from '@/lib/auth/rbac';
import { getApplicationById } from '@/lib/services/applications';

// US-7.1 — An APPLICATION_ADMIN hitting an Application they're not assigned to (e.g. by
// guessing a URL) gets a 403-equivalent message here, never the data, via
// requireApplicationAccess(). This page renders the error inline rather than using
// notFound()/an error boundary, so ADMINs still get a clear "not found" via notFound() below
// once access is confirmed but the row doesn't exist.
export default async function ApplicationDashboardPage({
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

  return (
    <section>
      <h1>{application.name}</h1>

      <h2>Environments</h2>
      <ul>
        {application.environments.map((environment) => (
          <li key={environment.id}>
            {environment.name}
            {environment.isProduction ? ' (Production)' : ''}
          </li>
        ))}
      </ul>

      <p>
        <Link href={`/applications/${applicationId}/admins`}>Manage Application Admins</Link>
      </p>

      {/* TODO: US-2.1/2.3 — Application dashboard: needs-authoring vs authored codes
          summary. Depends on Epic 3/4's ErrorMessage/ErrorContent data, out of scope for
          Epic 2. */}
    </section>
  );
}
