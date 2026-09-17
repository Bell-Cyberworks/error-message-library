// TODO: US-2.1/2.3 — Application dashboard: needs-authoring vs authored codes summary,
// plus entry points to admins/environments/codes/promotions management.
export default async function ApplicationDashboardPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;

  return (
    <section>
      <h1>Application dashboard</h1>
      <p>Application {applicationId} — not yet implemented.</p>
    </section>
  );
}
