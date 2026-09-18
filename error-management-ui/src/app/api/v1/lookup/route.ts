import { NextRequest, NextResponse } from 'next/server';
import { getApplicationByName } from '@/lib/services/applications';
import { getEnvironmentByName } from '@/lib/services/environments';
import { findOrAutoRegisterErrorContent } from '@/lib/services/errorCodes';

// Public lookup endpoint — see docs/error-code-schema.md ("Response shape (sketch)") for
// the field-name contract this must match exactly, since Libraries (multi-language) and
// Error UI consume this JSON directly.
//
// GET /api/v1/lookup?application=APPNAME&code=CODE&environment=ENVIRONMENT
// LANGUAGE comes from the Accept-Language header, per docs/error-code-schema.md.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const appname = searchParams.get('application');
  const code = searchParams.get('code');
  const environmentName = searchParams.get('environment');
  const language = resolveLanguage(request.headers.get('accept-language'));

  if (!appname || !code || !environmentName) {
    return NextResponse.json(
      {
        error:
          'Query params "application", "code", and "environment" are all required.',
      },
      { status: 400 },
    );
  }

  const application = await getApplicationByName(appname);
  if (!application) {
    return NextResponse.json(
      { error: `No application named "${appname}" is registered.` },
      { status: 404 },
    );
  }

  const environment = await getEnvironmentByName({
    applicationId: application.id,
    name: environmentName,
  });
  if (!environment) {
    return NextResponse.json(
      {
        error: `No environment named "${environmentName}" is registered for application "${appname}".`,
      },
      { status: 404 },
    );
  }

  const { errorMessage, content } = await findOrAutoRegisterErrorContent({
    applicationId: application.id,
    environmentId: environment.id,
    code,
    language,
  });

  return NextResponse.json({
    appname: application.name,
    code: errorMessage.code,
    language: content.language,
    environment: environment.name,
    header: content.header,
    description: content.description,
    friendlyMessage: content.friendlyMessage,
    category: content.category,
    errorCategory: content.errorCategory,
    httpCode: content.httpCode,
    alertString: content.alertString,
    redirectUrl: content.redirectUrl,
    eventId: content.eventId,
    eventCategory: content.eventCategory,
    transIdDisplay: content.transIdDisplay,
    retryEnabled: content.retryEnabled,
    errorCodeDisplay: content.errorCodeDisplay,
    needsAuthoring: content.needsAuthoring,
  });
}

/**
 * Picks the first language tag from an Accept-Language header
 * (e.g. "en-US,en;q=0.9" -> "en-US"). Falls back to "en" when the header is absent.
 */
function resolveLanguage(acceptLanguageHeader: string | null): string {
  if (!acceptLanguageHeader) {
    return 'en';
  }

  const [firstTag] = acceptLanguageHeader.split(',');
  return firstTag?.trim().split(';')[0] || 'en';
}
