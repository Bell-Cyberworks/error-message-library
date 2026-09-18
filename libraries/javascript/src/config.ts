/**
 * Reads library configuration from environment variables, lazily — at lookup time, never
 * cached at module load. A missing or blank environment variable must never be able to break
 * anything at import time, since that would undermine the very error type ({@link EMLError})
 * whose entire job is to report configuration and lookup failures gracefully instead of
 * crashing the calling application.
 */

export function appName(): string | undefined {
  return process.env.APPNAME;
}

export function apiBaseUrl(): string | undefined {
  return process.env.EML_API;
}

export function environment(): string | undefined {
  return process.env.ENVIRONMENT;
}

/**
 * No `LANGUAGE` environment variable exists. This mirrors the server's own default in
 * `resolveLanguage()` (error-management-ui/src/app/api/v1/lookup/route.ts) for a
 * missing/absent `Accept-Language` header, and matches the Java library's same decision.
 */
export function defaultLanguage(): string {
  return 'en';
}
