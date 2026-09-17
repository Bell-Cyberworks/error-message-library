// TODO: US-6.1–6.5 — Submit for promotion, review/approve/reject queue (submitter cannot
// approve their own request), and the read-only promotion audit trail.
export default async function ApplicationPromotionsPage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;

  return (
    <section>
      <h1>Promotions</h1>
      <p>Promotion requests for Application {applicationId} — not yet implemented.</p>
    </section>
  );
}
