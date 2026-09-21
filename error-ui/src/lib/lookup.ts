// Shape returned by error-management-ui's public lookup API. See
// error-management-ui/src/app/api/v1/lookup/route.ts (ground truth) and
// docs/error-code-schema.md ("Response shape (sketch)") for the field contract. The page only
// renders `header`, `code`, and `friendlyMessage`; the rest of the fields are part of the
// documented contract but out of scope for this display pass — see error-ui/README.md.
export interface LookupResponse {
  appname: string;
  code: string;
  language: string;
  environment: string;
  header: string;
  description: string;
  friendlyMessage: string;
  category: string | null;
  errorCategory: string | null;
  httpCode: number | null;
  alertString: string | null;
  redirectUrl: string | null;
  eventId: string | null;
  eventCategory: string | null;
  transIdDisplay: string | null;
  retryEnabled: boolean | null;
  errorCodeDisplay: string | null;
  needsAuthoring: boolean;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

export interface ErrorPageParams {
  appname: string | null;
  code: string | null;
  environment: string | null;
  language: string | null;
}

export const FALLBACK_HEADER = "We couldn't load this error";
export const FALLBACK_MESSAGE =
  "We couldn't load this error's details right now. Please try again later.";

export function normalizeParams(rawParams: RawSearchParams): ErrorPageParams {
  return {
    appname: firstValue(rawParams.appname),
    code: firstValue(rawParams.code),
    environment: firstValue(rawParams.environment),
    language: firstValue(rawParams.language),
  };
}

export function firstValue(value: string | string[] | undefined): string | null {
  const resolved = Array.isArray(value) ? value[0] : value;
  return resolved ? resolved : null;
}

export async function lookupErrorDetails(
  params: ErrorPageParams,
): Promise<LookupResponse | null> {
  const { appname, code, environment, language } = params;

  if (!appname || !code || !environment || !language) {
    return null;
  }

  const managementApiUrl = process.env.MANAGEMENT_API_URL;
  if (!managementApiUrl) {
    console.error('MANAGEMENT_API_URL is not set; cannot look up error details.');
    return null;
  }

  const systemApiKey = process.env.EML_SYSTEM_API_KEY;
  if (!systemApiKey) {
    console.error('EML_SYSTEM_API_KEY is not set; cannot look up error details.');
    return null;
  }

  const lookupUrl = new URL('/api/v1/lookup', managementApiUrl);
  lookupUrl.searchParams.set('application', appname);
  lookupUrl.searchParams.set('code', code);
  lookupUrl.searchParams.set('environment', environment);

  try {
    const response = await fetch(lookupUrl, {
      headers: { 'Accept-Language': language, 'Authorization': `Bearer ${systemApiKey}` },
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as LookupResponse;
  } catch (error) {
    console.error('Failed to reach MANAGEMENT_API_URL for an error lookup.', error);
    return null;
  }
}
