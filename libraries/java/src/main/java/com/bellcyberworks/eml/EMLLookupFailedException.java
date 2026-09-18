package com.bellcyberworks.eml;

/**
 * Signals that an EML lookup did not succeed, for any reason: invalid/missing
 * configuration, a network failure, a non-2xx HTTP status, or a response body that could
 * not be parsed/used. Never seen outside this package — {@link EMLError} always catches it
 * and falls back to {@link LookupResult#localFallback(String)}.
 */
class EMLLookupFailedException extends Exception {

    EMLLookupFailedException(String message) {
        super(message);
    }

    EMLLookupFailedException(String message, Throwable cause) {
        super(message, cause);
    }
}
