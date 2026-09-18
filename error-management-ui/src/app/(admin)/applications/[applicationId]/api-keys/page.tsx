import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth/options';
import { requireApplicationAccess, ForbiddenError, UnauthorizedError } from '@/lib/auth/rbac';
import { getApplicationById } from '@/lib/services/applications';
import { listApplicationApiKeys } from '@/lib/services/apiKeys';
import { CreateApplicationApiKeyForm } from '@/components/CreateApplicationApiKeyForm';
import { revokeApplicationApiKeyAction } from '@/actions/apiKeys';

// Per-Application API key management for the public lookup endpoint
// (src/app/api/v1/lookup/route.ts). Available to any user with access to this Application (not
// Admin-only) — same access level as Environments (src/app/(admin)/applications/
// [applicationId]/environments/page.tsx), since an Application Admin owns their own
// Application's keys, unlike Application-Admin *assignment*, which really is Admin-only.
export default async function ApplicationApiKeysPage({
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

  const apiKeys = await listApplicationApiKeys(applicationId);

  // A plain `<form action>` (no useActionState) must return void — revokeApplicationApiKeyAction
  // returns an ActionResult so it can also be reused elsewhere. This inline Server Action just
  // discards the result; the row updates via revalidatePath. Same pattern as the admins page's
  // removeAdmin().
  async function revokeKey(formData: FormData) {
    'use server';
    await revokeApplicationApiKeyAction(formData);
  }

  return (
    <section>
      <h1>API Keys — {application.name}</h1>
      <p>
        <Link href={`/applications/${applicationId}`}>Back to Application</Link>
      </p>
      <p>
        Per-Application API keys authorize <code>GET /api/v1/lookup</code> to read and
        auto-register error codes for this Application only. Configure this Application&rsquo;s
        client libraries with the <code>EML_API_KEY</code> environment variable, set to one of
        the keys below.
      </p>

      <h2>Existing keys</h2>
      {apiKeys.length === 0 ? (
        <p>No API keys yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Prefix</th>
              <th scope="col">Created</th>
              <th scope="col">Last used</th>
              <th scope="col">Status</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {apiKeys.map((apiKey) => (
              <tr key={apiKey.id}>
                <td>{apiKey.name}</td>
                <td>
                  <code>{apiKey.keyPrefix}…</code>
                </td>
                <td>{apiKey.createdAt.toLocaleString()}</td>
                <td>{apiKey.lastUsedAt ? apiKey.lastUsedAt.toLocaleString() : 'Never'}</td>
                <td>
                  {apiKey.revokedAt ? `Revoked ${apiKey.revokedAt.toLocaleString()}` : 'Active'}
                </td>
                <td>
                  {apiKey.revokedAt ? null : (
                    <form action={revokeKey}>
                      <input type="hidden" name="applicationId" value={applicationId} />
                      <input type="hidden" name="id" value={apiKey.id} />
                      <button type="submit">Revoke</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <CreateApplicationApiKeyForm applicationId={applicationId} />
    </section>
  );
}
