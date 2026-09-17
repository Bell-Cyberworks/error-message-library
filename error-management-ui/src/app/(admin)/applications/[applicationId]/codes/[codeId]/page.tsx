// TODO: US-4.1/4.2/4.3 — Edit a code's metadata, add a language, and edit a language's
// content, per-environment (NonProd direct-save / Prod via promotion only).
export default async function ErrorCodeDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string; codeId: string }>;
}) {
  const { applicationId, codeId } = await params;

  return (
    <section>
      <h1>Error code detail</h1>
      <p>
        Code {codeId} for Application {applicationId} — not yet implemented.
      </p>
    </section>
  );
}
