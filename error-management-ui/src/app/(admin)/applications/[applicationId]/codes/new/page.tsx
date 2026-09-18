import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth/options';
import { requireApplicationAccess, ForbiddenError, UnauthorizedError } from '@/lib/auth/rbac';
import { getApplicationById } from '@/lib/services/applications';
import { listNonProductionEnvironmentsForApplication } from '@/lib/services/environments';
import { CreateErrorCodeForm } from '@/components/CreateErrorCodeForm';

// US-3.1 — Manually create a new error code for this Application, in a NonProd environment
// the Application Admin selects. Content starts empty/placeholder and the code is marked
// needsAuthoring (see src/lib/services/errorCodes.ts's createErrorCode()).
export default async function NewErrorCodePage({
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

  const nonProdEnvironments = await listNonProductionEnvironmentsForApplication(applicationId);

  return (
    <section>
      <h1>New error code — {application.name}</h1>
      <p>
        <Link href={`/applications/${applicationId}`}>Back to Application</Link>
      </p>

      {nonProdEnvironments.length === 0 ? (
        <p>
          This Application has no NonProd environments yet. Create one on the{' '}
          <Link href={`/applications/${applicationId}/environments`}>Environments page</Link>{' '}
          before creating an error code — codes can only be created in NonProd, never directly
          in Production.
        </p>
      ) : (
        <CreateErrorCodeForm applicationId={applicationId} environments={nonProdEnvironments} />
      )}
    </section>
  );
}
