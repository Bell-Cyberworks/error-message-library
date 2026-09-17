// TODO: US-2.3 — Manage Application Admin assignments for this Application (Admin only).
export default async function ApplicationAdminsPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;

  return (
    <section>
      <h1>Application admins</h1>
      <p>Admin assignments for Application {applicationId} — not yet implemented.</p>
    </section>
  );
}
