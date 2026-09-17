import Link from 'next/link';
import { auth } from '@/lib/auth/options';
import { listApplicationsForUser } from '@/lib/services/applications';
import { CreateApplicationForm } from '@/components/CreateApplicationForm';

// US-2.4 — Admins see every Application and who's assigned to each; Application Admins see
// only the ones they're assigned to. listApplicationsForUser() branches on role itself (the
// enforcement point — see src/lib/services/applications.ts) rather than this page filtering
// a full list client-side.
export default async function ApplicationsPage() {
  const session = await auth();
  const applications = await listApplicationsForUser(session);
  const isAdmin = session?.user.role === 'ADMIN';

  return (
    <section>
      <h1>Applications</h1>

      {isAdmin ? <CreateApplicationForm /> : null}

      <h2>{isAdmin ? 'All Applications' : 'Your Applications'}</h2>
      {applications.length === 0 ? (
        <p>
          {isAdmin
            ? 'No Applications have been registered yet.'
            : 'You are not assigned to any Applications yet.'}
        </p>
      ) : (
        <table>
          <thead>
            <tr>
              <th scope="col">Application</th>
              <th scope="col">Assigned admins</th>
            </tr>
          </thead>
          <tbody>
            {applications.map((application) => (
              <tr key={application.id}>
                <td>
                  <Link href={`/applications/${application.id}`}>{application.name}</Link>
                </td>
                <td>
                  {application.adminAssignments.length === 0
                    ? 'None assigned'
                    : application.adminAssignments
                        .map((assignment) =>
                          assignment.user.name
                            ? `${assignment.user.name} (${assignment.user.email})`
                            : assignment.user.email,
                        )
                        .join(', ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
