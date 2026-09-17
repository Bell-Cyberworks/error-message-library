import { auth } from '@/lib/auth/options';
import { requireRole } from '@/lib/auth/rbac';
import { listAllUsers } from '@/lib/services/users';
import { CreateApplicationAdminForm } from '@/components/CreateApplicationAdminForm';

// US-2.2 — Create Application Admin accounts (Admin only). Admins set the initial password
// directly; there's no self-signup/invite flow in v1 (management-ui-backlog.md's Epic 2 open
// question, resolved that way — see prisma/seed.ts's comment for the same decision applied
// to the bootstrap Admin account).
// US-7.2 — Admins see and manage every User (not just Application Admins), so this lists all
// roles, not just APPLICATION_ADMIN.
export default async function UsersPage() {
  const session = await auth();
  requireRole(session, 'ADMIN');

  const users = await listAllUsers();

  return (
    <section>
      <h1>Users</h1>

      <h2>Create Application Admin</h2>
      <CreateApplicationAdminForm />

      <h2>All users</h2>
      <table>
        <thead>
          <tr>
            <th scope="col">Name</th>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td>{user.name ?? '—'}</td>
              <td>{user.email}</td>
              <td>{user.role}</td>
              <td>{user.isActive ? 'Active' : 'Inactive'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
