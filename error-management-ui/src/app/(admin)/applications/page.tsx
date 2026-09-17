import { auth } from '@/lib/auth/options';
import { requireRole } from '@/lib/auth/rbac';

// TODO: US-2.4 — Admin sees all Applications and who's assigned to each (list + register,
// per management-ui-architecture.md's folder structure). Application Admins need their own
// scoped view too — only the Applications they're assigned to via
// ApplicationAdminAssignment — which is not implemented here yet.
export default async function ApplicationsPage() {
  const session = await auth();
  requireRole(session, 'ADMIN');

  return (
    <section>
      <h1>Applications</h1>
      <p>Applications list — not yet implemented.</p>
    </section>
  );
}
