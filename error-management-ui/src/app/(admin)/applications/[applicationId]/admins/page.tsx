import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth/options';
import { requireRole } from '@/lib/auth/rbac';
import { getApplicationById } from '@/lib/services/applications';
import { listApplicationAdminUsers } from '@/lib/services/users';
import { AssignApplicationAdminForm } from '@/components/AssignApplicationAdminForm';
import { removeApplicationAdminAction } from '@/actions/applications';

// US-2.3 — Manage Application Admin assignments for this Application. Assignment management
// is Admin-only per management-ui-backlog.md, so this uses requireRole('ADMIN') rather than
// requireApplicationAccess() (which would also let an assigned Application Admin in).
export default async function ApplicationAdminsPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;
  const session = await auth();
  requireRole(session, 'ADMIN');

  const application = await getApplicationById(applicationId);

  if (!application) {
    notFound();
  }

  const applicationAdminUsers = await listApplicationAdminUsers();
  const assignedUserIds = new Set(application.adminAssignments.map((a) => a.userId));
  const eligibleUsers = applicationAdminUsers.filter((user) => !assignedUserIds.has(user.id));

  // A plain `<form action>` (no useActionState) must return void — removeApplicationAdminAction
  // returns an ActionResult so it can also be reused with useActionState elsewhere. This inline
  // Server Action just discards the result; the row simply disappears via revalidatePath.
  async function removeAdmin(formData: FormData) {
    'use server';
    await removeApplicationAdminAction(formData);
  }

  return (
    <section>
      <h1>Application Admins — {application.name}</h1>
      <p>
        <Link href={`/applications/${applicationId}`}>Back to Application</Link>
      </p>

      <h2>Currently assigned</h2>
      {application.adminAssignments.length === 0 ? (
        <p>No Application Admins are assigned yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Actions</th>
            </tr>
          </thead>
          <tbody>
            {application.adminAssignments.map((assignment) => (
              <tr key={assignment.id}>
                <td>{assignment.user.name ?? '—'}</td>
                <td>{assignment.user.email}</td>
                <td>
                  <form action={removeAdmin}>
                    <input type="hidden" name="applicationId" value={applicationId} />
                    <input type="hidden" name="userId" value={assignment.userId} />
                    <button type="submit">Remove</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Assign an Application Admin</h2>
      <AssignApplicationAdminForm applicationId={applicationId} eligibleUsers={eligibleUsers} />
    </section>
  );
}
