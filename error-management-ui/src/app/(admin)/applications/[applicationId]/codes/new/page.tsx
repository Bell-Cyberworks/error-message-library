// TODO: US-3.1 — Manually create a new error code for this Application, in a NonProd
// environment the Application Admin selects. Content starts empty/placeholder and the
// code is marked needsAuthoring.
export default async function NewErrorCodePage({
  params,
}: {
  params: Promise<{ applicationId: string }>;
}) {
  const { applicationId } = await params;

  return (
    <section>
      <h1>New error code</h1>
      <p>Create a new error code for Application {applicationId} — not yet implemented.</p>
    </section>
  );
}
