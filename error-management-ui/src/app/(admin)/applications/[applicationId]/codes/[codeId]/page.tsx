import Link from 'next/link';
import { notFound } from 'next/navigation';
import { auth } from '@/lib/auth/options';
import { requireApplicationAccess, ForbiddenError, UnauthorizedError } from '@/lib/auth/rbac';
import { getApplicationById } from '@/lib/services/applications';
import { getErrorMessageWithContents } from '@/lib/services/errorCodes';
import { LANGUAGES, getLanguageLabel } from '@/lib/constants/languages';
import { EditErrorContentForm } from '@/components/EditErrorContentForm';
import { AddLanguageForm } from '@/components/AddLanguageForm';

// US-4.1/4.2/4.3 — Edit a code's metadata, add a language, and edit a language's content,
// per-environment. NonProd rows are directly editable (EditErrorContentForm, saved
// immediately, needsAuthoring cleared on save); Prod rows are read-only here — Epic 6's
// promotion flow (not yet implemented) is the only path into Prod content.
export default async function ErrorCodeDetailPage({
  params,
}: {
  params: Promise<{ applicationId: string; codeId: string }>;
}) {
  const { applicationId, codeId } = await params;
  const session = await auth();

  try {
    await requireApplicationAccess(session, applicationId);
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return (
        <section>
          <h1>Access denied</h1>
          <p role="alert">{error.message}</p>
        </section>
      );
    }
    throw error;
  }

  const application = await getApplicationById(applicationId);

  if (!application) {
    notFound();
  }

  const errorMessage = await getErrorMessageWithContents(applicationId, codeId);

  if (!errorMessage) {
    notFound();
  }

  return (
    <section>
      <h1>{errorMessage.code}</h1>
      <p>
        <Link href={`/applications/${applicationId}`}>Back to Application</Link>
      </p>

      {application.environments.map((environment) => {
        const contents = errorMessage.contents.filter(
          (content) => content.environmentId === environment.id,
        );
        const presentLanguages = new Set(contents.map((content) => content.language));
        const availableLanguages = LANGUAGES.filter(
          (language) => !presentLanguages.has(language.code),
        );

        return (
          <section key={environment.id}>
            <h2>
              {environment.name}
              {environment.isProduction ? ' (Production)' : ''}
            </h2>

            {contents.length === 0 ? (
              <p>
                {environment.isProduction
                  ? 'Not yet promoted to this environment.'
                  : 'No content yet for this environment.'}
              </p>
            ) : (
              contents.map((content) => (
                <div key={content.id}>
                  <h3>
                    {getLanguageLabel(content.language)}{' '}
                    {content.needsAuthoring ? <span>(Needs authoring)</span> : null}
                  </h3>

                  {environment.isProduction ? (
                    <div>
                      <dl>
                        <dt>Header</dt>
                        <dd>{content.header}</dd>
                        <dt>Description</dt>
                        <dd>{content.description}</dd>
                        <dt>Friendly message</dt>
                        <dd>{content.friendlyMessage}</dd>
                        <dt>Category</dt>
                        <dd>{content.category}</dd>
                        <dt>Error category</dt>
                        <dd>{content.errorCategory}</dd>
                        <dt>HTTP code</dt>
                        <dd>{content.httpCode}</dd>
                        <dt>Alert string</dt>
                        <dd>{content.alertString}</dd>
                        <dt>Redirect URL</dt>
                        <dd>{content.redirectUrl ?? '—'}</dd>
                        <dt>Event ID</dt>
                        <dd>{content.eventId ?? '—'}</dd>
                        <dt>Event category</dt>
                        <dd>{content.eventCategory ?? '—'}</dd>
                        <dt>Show transaction ID</dt>
                        <dd>{content.transIdDisplay ? 'Yes' : 'No'}</dd>
                        <dt>Offer retry</dt>
                        <dd>{content.retryEnabled ? 'Yes' : 'No'}</dd>
                        <dt>Show raw error code</dt>
                        <dd>{content.errorCodeDisplay ? 'Yes' : 'No'}</dd>
                      </dl>
                      <p>Edit via promotion (not yet implemented).</p>
                    </div>
                  ) : (
                    <EditErrorContentForm content={content} />
                  )}
                </div>
              ))
            )}

            {environment.isProduction ? null : (
              <AddLanguageForm
                errorMessageId={errorMessage.id}
                environmentId={environment.id}
                availableLanguages={availableLanguages}
              />
            )}
          </section>
        );
      })}
    </section>
  );
}
