import type { LookupResult } from './lookupResult.js';

/**
 * Signals that an EML lookup did not succeed, for any reason: invalid/missing
 * configuration, a network failure, a non-2xx HTTP status, or a response body that could not
 * be parsed/used. Never seen outside this module — {@link EMLError} always catches it and
 * falls back to `localFallback(code)`.
 */
export class LookupFailedError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'LookupFailedError';
  }
}

const REQUEST_TIMEOUT_MS = 3000;

/**
 * Calls the Error Management UI's public lookup endpoint —
 * `GET /api/v1/lookup?application=&code=&environment=` with an `Accept-Language` header for
 * language (see error-management-ui/src/app/api/v1/lookup/route.ts) — and translates a
 * successful response into a {@link LookupResult}.
 *
 * Every failure mode (bad configuration, network failure, non-2xx HTTP status, unparseable or
 * unusable response body) is signaled by throwing {@link LookupFailedError}; this function
 * never itself decides to fall back — that's `EMLError.forCode`'s job.
 */
export async function lookup(
  appname: string | undefined,
  apiBaseUrl: string | undefined,
  environment: string | undefined,
  code: string,
  language: string,
): Promise<LookupResult> {
  if (
    appname === undefined ||
    appname.trim().length === 0 ||
    apiBaseUrl === undefined ||
    apiBaseUrl.trim().length === 0 ||
    environment === undefined ||
    environment.trim().length === 0
  ) {
    throw new LookupFailedError(
      'Missing required configuration: APPNAME, EML_API, and ENVIRONMENT must all be set',
    );
  }

  const baseUrl = apiBaseUrl.endsWith('/') ? apiBaseUrl.slice(0, -1) : apiBaseUrl;
  const url =
    `${baseUrl}/api/v1/lookup` +
    `?application=${encodeURIComponent(appname)}` +
    `&code=${encodeURIComponent(code)}` +
    `&environment=${encodeURIComponent(environment)}`;

  let response: Response;
  try {
    // Node's built-in `fetch` doesn't expose a separate connect-timeout the way Java's
    // HttpClient does; a single combined request timeout via AbortSignal.timeout is the
    // idiomatic Node equivalent of Java's connect(2s)/request(3s) pair. 3s covers the whole
    // request/response cycle.
    response = await fetch(url, {
      headers: { 'Accept-Language': language },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (e) {
    throw new LookupFailedError(`EML lookup request failed for code '${code}'`, { cause: e });
  }

  if (!response.ok) {
    throw new LookupFailedError(
      `EML lookup for code '${code}' returned HTTP ${response.status}`,
    );
  }

  let body: string;
  try {
    body = await response.text();
  } catch (e) {
    throw new LookupFailedError(
      `EML lookup response body for code '${code}' could not be read`,
      { cause: e },
    );
  }

  return parseResponse(body, code, appname, environment, language);
}

function parseResponse(
  body: string,
  code: string,
  appname: string,
  environment: string,
  language: string,
): LookupResult {
  let json: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('response body was not a JSON object');
    }
    json = parsed as Record<string, unknown>;
  } catch (e) {
    throw new LookupFailedError(
      `EML lookup response for code '${code}' was not valid JSON`,
      { cause: e },
    );
  }

  // header and friendlyMessage are the two fields the rest of this library can't function
  // without; every other field is deliberately lenient (safe per-field default) so a future
  // server-side change doesn't break old client versions.
  const headerValue = json.header;
  const friendlyMessageValue = json.friendlyMessage;
  if (typeof headerValue !== 'string' || typeof friendlyMessageValue !== 'string') {
    throw new LookupFailedError(
      `EML lookup response for code '${code}' is missing required string field(s) 'header'/'friendlyMessage'`,
    );
  }

  return {
    code: stringOrDefault(json, 'code', code),
    appname: stringOrDefault(json, 'appname', appname),
    environment: stringOrDefault(json, 'environment', environment),
    language: stringOrDefault(json, 'language', language),
    header: headerValue,
    description: stringOrDefault(json, 'description', ''),
    friendlyMessage: friendlyMessageValue,
    category: stringOrDefault(json, 'category', ''),
    errorCategory: stringOrDefault(json, 'errorCategory', ''),
    httpCode: numberOrDefault(json, 'httpCode', 0),
    alertString: stringOrDefault(json, 'alertString', ''),
    redirectUrl: nullableString(json, 'redirectUrl'),
    eventId: nullableString(json, 'eventId'),
    eventCategory: nullableString(json, 'eventCategory'),
    transIdDisplay: booleanOrDefault(json, 'transIdDisplay', false),
    retryEnabled: booleanOrDefault(json, 'retryEnabled', false),
    errorCodeDisplay: booleanOrDefault(json, 'errorCodeDisplay', false),
    needsAuthoring: booleanOrDefault(json, 'needsAuthoring', false),
    resolved: true,
  };
}

function stringOrDefault(json: Record<string, unknown>, key: string, defaultValue: string): string {
  const value = json[key];
  return typeof value === 'string' ? value : defaultValue;
}

function nullableString(json: Record<string, unknown>, key: string): string | null {
  const value = json[key];
  return typeof value === 'string' ? value : null;
}

function numberOrDefault(json: Record<string, unknown>, key: string, defaultValue: number): number {
  const value = json[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : defaultValue;
}

function booleanOrDefault(json: Record<string, unknown>, key: string, defaultValue: boolean): boolean {
  const value = json[key];
  return typeof value === 'boolean' ? value : defaultValue;
}
