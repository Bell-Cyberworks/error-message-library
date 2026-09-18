import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth/options';
import { requireApplicationAccess, ForbiddenError, UnauthorizedError } from '@/lib/auth/rbac';
import { getApplicationById } from '@/lib/services/applications';
import { listErrorMessagesForApplication } from '@/lib/services/errorCodes';

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

  const errorMessages = await listErrorMessagesForApplication(applicationId);
  const needsAuthoring = errorMessages.filter((errorMessage) => errorMessage.needsAuthoring);
  const authored = errorMessages.filter((errorMessage) => !errorMessage.needsAuthoring);

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
        <Link href={`/applications/${applicationId}/environments`}>Manage Environments</Link>
      </p>

      <p>
        <Link href={`/applications/${applicationId}/admins`}>Manage Application Admins</Link>
      </p>

      <p>
        <Link href={`/applications/${applicationId}/promotions`}>Promotions</Link>
      </p>

      <p>
        <Link href={`/applications/${applicationId}/api-keys`}>API Keys</Link>
      </p>

      {/* Epic 3 dashboard — this section replaces the page's original "TODO: US-2.1/2.3"
          comment, whose ticket reference was wrong when first scaffolded (that data didn't
          exist until Epic 3/4's ErrorMessage/ErrorContent model, via
          listErrorMessagesForApplication()). */}
      <h2>Error codes</h2>
      <p>
        <Link href={`/applications/${applicationId}/codes/new`}>+ New error code</Link>
      </p>

      <h3>Needs authoring</h3>
      {needsAuthoring.length === 0 ? (
        <p>Nothing needs authoring.</p>
      ) : (
        <ul>
          {needsAuthoring.map((errorMessage) => (
            <li key={errorMessage.id}>
              <Link href={`/applications/${applicationId}/codes/${errorMessage.id}`}>
                {errorMessage.code}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <h3>Authored</h3>
      {authored.length === 0 ? (
        <p>No fully-authored error codes yet.</p>
      ) : (
        <ul>
          {authored.map((errorMessage) => (
            <li key={errorMessage.id}>
              <Link href={`/applications/${applicationId}/codes/${errorMessage.id}`}>
                {errorMessage.code}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
