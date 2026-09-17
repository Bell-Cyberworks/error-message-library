import { auth } from '@/lib/auth/options';
import { requireRole } from '@/lib/auth/rbac';

// TODO: US-2.2 — Create Application Admin accounts (Admin only). Open question in
// management-ui-backlog.md: temporary/set password vs. invite flow — mechanism TBD.
export default async function UsersPage() {
  const session = await auth();
  requireRole(session, 'ADMIN');

  return (
    <section>
      <h1>Users</h1>
      <p>User management — not yet implemented.</p>
    </section>
  );
}
