import { auth } from '@/lib/auth/options';
import { requireRole } from '@/lib/auth/rbac';
import { listSystemApiKeys } from '@/lib/services/apiKeys';
import { CreateSystemApiKeyForm } from '@/components/CreateSystemApiKeyForm';
import { revokeSystemApiKeyAction } from '@/actions/apiKeys';

// System-level API key management (Admin only) for the public lookup endpoint
// (src/app/api/v1/lookup/route.ts). System keys grant read/lookup access across every
// Application — used by callers (Error UI) that look up whichever Application a caller sends
// them to, rather than holding one Application's key ahead of time. Same access level as
// Application registration itself (requireRole('ADMIN')), matching the Users page's pattern.
export default async function SystemApiKeysPage() {
  const session = await auth();
  requireRole(session, 'ADMIN');

  const apiKeys = await listSystemApiKeys();

  // A plain `<form action>` (no useActionState) must return void — revokeSystemApiKeyAction
  // returns an ActionResult so it can also be reused elsewhere. This inline Server Action just
  // discards the result; the row updates via revalidatePath. Same pattern as the
  // per-Application API keys page's revokeKey().
  async function revokeKey(formData: FormData) {
    'use server';
    await revokeSystemApiKeyAction(formData);
  }

  return (
    <section>
      <h1>System API Keys</h1>
      <p>
        System API keys authorize <code>GET /api/v1/lookup</code> across every Application —
        intended for trusted internal tooling (Error UI) that resolves whichever Application a
        caller sends it, rather than one Application&rsquo;s own client library (which should
        use a per-Application key from that Application&rsquo;s API Keys page instead).
      </p>

      <h2>Existing keys</h2>
      {apiKeys.length === 0 ? (
        <p>No system API keys yet.</p>
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

      <CreateSystemApiKeyForm />
    </section>
  );
}
