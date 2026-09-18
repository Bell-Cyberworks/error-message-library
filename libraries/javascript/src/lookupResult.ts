/**
 * Internal type holding every field of the EML lookup API's JSON response (see
 * error-management-ui/src/app/api/v1/lookup/route.ts and
 * docs/error-code-schema.md — "Response shape (sketch)"), plus one library-only field:
 * `resolved`. `resolved` is `true` for a real server response and `false` for a
 * {@link localFallback} — the one signal the server JSON can never itself carry, since a
 * fallback is built entirely on the client with no server involved.
 *
 * Not exported from `index.ts` — this is an internal shape; {@link EMLError} is the public
 * surface consumers interact with.
 */
export interface LookupResult {
  code: string;
  appname: string;
  environment: string;
  language: string;
  header: string;
  description: string;
  friendlyMessage: string;
  category: string;
  errorCategory: string;
  httpCode: number;
  alertString: string;
  redirectUrl: string | null;
  eventId: string | null;
  eventCategory: string | null;
  transIdDisplay: boolean;
  retryEnabled: boolean;
  errorCodeDisplay: boolean;
  needsAuthoring: boolean;
  resolved: boolean;
}

/**
 * Builds a local, client-only result used when EML could not be reached or its response
 * could not be used (bad config, network failure, non-2xx status, unparseable/incomplete
 * body). `needsAuthoring` is `false` here — not `true` — because that flag describes a real
 * server-side "no owner has authored this code yet" state, and no database row was ever
 * touched to make that determination; it simply doesn't apply.
 *
 * Kept in sync with the Java library's `LookupResult.localFallback(String)` for consistency
 * across client libraries.
 */
export function localFallback(code: string): LookupResult {
  const safeCode = code ?? '';
  return {
    code: safeCode,
    appname: '',
    environment: '',
    language: '',
    header: 'Error Handling Unavailable',
    description: '',
    friendlyMessage:
      `An error occurred (code: ${safeCode}), but the Error Message Library ` +
      'could not be reached. Please try again later or contact support.',
    category: '',
    errorCategory: '',
    httpCode: 500,
    alertString: '',
    redirectUrl: null,
    eventId: null,
    eventCategory: null,
    transIdDisplay: false,
    retryEnabled: false,
    errorCodeDisplay: false,
    needsAuthoring: false,
    resolved: false,
  };
}
