// TODO: US-5.1 — View and select this Application's environments; selecting Prod shows
// content read-only (edits route to promotion, not a live form).
export default async function ApplicationEnvironmentsPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;

  return (
    <section>
      <h1>Environments</h1>
      <p>Environments for Application {applicationId} — not yet implemented.</p>
    </section>
  );
}
