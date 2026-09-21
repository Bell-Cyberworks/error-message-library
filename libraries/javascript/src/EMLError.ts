import { lookup } from './lookupClient.js';
import { localFallback, type LookupResult } from './lookupResult.js';
import { appName, apiBaseUrl, environment, apiKey, defaultLanguage } from './config.js';

/**
 * The library's entire public surface.
 *
 * `EMLError.forCode(code)` resolves `code` against the Error Management UI's public lookup
 * API — configured via the `APPNAME`, `EML_API`, `ENVIRONMENT`, and `EML_API_KEY` environment
 * variables — and always produces a usable, resolved `Promise<EMLError>`. If EML itself can't
 * be reached, or returns something this library can't use, a local fallback message is used
 * instead; nothing but a successfully-constructed `EMLError` ever escapes `forCode`. That
 * resilience is the entire point of this library: its own error handling must never itself
 * crash the calling application.
 *
 * Unlike the Java library, where `EMLError`'s constructor performs the lookup synchronously,
 * JavaScript has no way to perform a blocking network call inside a constructor — Node's
 * `fetch` is always a `Promise`. The constructor is therefore private, and `forCode` is a
 * static async factory that is the idiomatic TypeScript/Node equivalent: it always resolves
 * (never rejects) to a usable `EMLError` instance, matching Java's "nothing but the library's
 * own error type ever escapes" guarantee as closely as the language allows.
 */
export class EMLError extends Error {
  readonly code: string;
  readonly appname: string;
  readonly environment: string;
  readonly language: string;
  readonly header: string;
  readonly description: string;
  readonly friendlyMessage: string;
  readonly category: string;
  readonly errorCategory: string;
  readonly httpCode: number;
  readonly alertString: string;
  readonly redirectUrl: string | null;
  readonly eventId: string | null;
  readonly eventCategory: string | null;
  readonly transIdDisplay: boolean;
  readonly retryEnabled: boolean;
  readonly errorCodeDisplay: boolean;
  readonly needsAuthoring: boolean;
  readonly resolved: boolean;

  private constructor(result: LookupResult) {
    super(`${result.code}: ${result.friendlyMessage}`);
    this.name = 'EMLError';
    this.code = result.code;
    this.appname = result.appname;
    this.environment = result.environment;
    this.language = result.language;
    this.header = result.header;
    this.description = result.description;
    this.friendlyMessage = result.friendlyMessage;
    this.category = result.category;
    this.errorCategory = result.errorCategory;
    this.httpCode = result.httpCode;
    this.alertString = result.alertString;
    this.redirectUrl = result.redirectUrl;
    this.eventId = result.eventId;
    this.eventCategory = result.eventCategory;
    this.transIdDisplay = result.transIdDisplay;
    this.retryEnabled = result.retryEnabled;
    this.errorCodeDisplay = result.errorCodeDisplay;
    this.needsAuthoring = result.needsAuthoring;
    this.resolved = result.resolved;

    // Node-specific, non-standard API — guard for its existence rather than assume it.
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, EMLError);
    }
  }

  /**
   * Resolves `code` against the EML lookup API and returns a usable `EMLError`. Configured
   * via the `APPNAME`, `EML_API`, `ENVIRONMENT`, and `EML_API_KEY` environment variables.
   * `language` defaults to `"en"`, matching the server's own default for a missing
   * `Accept-Language` header.
   *
   * This promise never rejects: any failure (missing configuration, network failure, a
   * non-2xx response, an unparseable/unusable body) is caught internally, logged as a
   * warning, and replaced with a local fallback `EMLError` whose `resolved` is `false`.
   */
  static async forCode(code: string, language: string = defaultLanguage()): Promise<EMLError> {
    try {
      const result = await lookup(
        appName(),
        apiBaseUrl(),
        environment(),
        apiKey(),
        code,
        language,
      );
      return new EMLError(result);
    } catch (e) {
      console.warn(`EML lookup failed for code '${code}': ${e instanceof Error ? e.message : String(e)}`);
      return new EMLError(localFallback(code));
    }
  }
}
