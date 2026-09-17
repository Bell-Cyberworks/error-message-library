import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';

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

  const errorMessage = await prisma.errorMessage.findFirst({
    where: {
      code,
      application: { name: appname },
    },
    include: {
      contents: {
        where: {
          language,
          environment: { name: environmentName },
        },
        include: { environment: true },
        take: 1,
      },
    },
  });

  const content = errorMessage?.contents[0];

  if (!errorMessage || !content) {
    // TODO: auto-registration on cache miss — see error-code-schema.md ("Auto-registration").
    // A missing (APPNAME, CODE) pair should be created automatically with placeholder text,
    // flagged needsAuthoring, and this endpoint should return that placeholder immediately
    // instead of a hard failure. Not implemented yet — 501 until that follow-up lands.
    return NextResponse.json(
      { error: 'Not found, and auto-registration on cache miss is not implemented yet.' },
      { status: 501 },
    );
  }

  return NextResponse.json({
    appname,
    code: errorMessage.code,
    language: content.language,
    environment: content.environment.name,
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
