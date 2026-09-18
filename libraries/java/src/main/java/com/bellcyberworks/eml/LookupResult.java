package com.bellcyberworks.eml;

/**
 * Internal DTO holding every field of the EML lookup API's JSON response (see
 * error-management-ui/src/app/api/v1/lookup/route.ts and
 * docs/error-code-schema.md — "Response shape (sketch)"), plus one library-only field:
 * {@code resolved}. {@code resolved} is {@code true} for a real server response and
 * {@code false} for a {@link #localFallback(String)} — the one signal the server JSON can
 * never itself carry, since a fallback is built entirely on the client with no server
 * involved.
 */
record LookupResult(
        String code,
        String appname,
        String environment,
        String language,
        String header,
        String description,
        String friendlyMessage,
        String category,
        String errorCategory,
        int httpCode,
        String alertString,
        String redirectUrl,
        String eventId,
        String eventCategory,
        boolean transIdDisplay,
        boolean retryEnabled,
        boolean errorCodeDisplay,
        boolean needsAuthoring,
        boolean resolved) {

    /**
     * Builds a local, client-only result used when EML could not be reached or its response
     * could not be used (bad config, network failure, non-2xx status, unparseable/incomplete
     * body). {@code needsAuthoring} is {@code false} here — not {@code true} — because that
     * flag describes a real server-side "no owner has authored this code yet" state, and no
     * database row was ever touched to make that determination; it simply doesn't apply.
     */
    static LookupResult localFallback(String code) {
        String safeCode = code == null ? "" : code;
        return new LookupResult(
                safeCode,
                "",
                "",
                "",
                "Error Handling Unavailable",
                "",
                "An error occurred (code: " + safeCode + "), but the Error Message Library "
                        + "could not be reached. Please try again later or contact support.",
                "",
                "",
                500,
                "",
                null,
                null,
                null,
                false,
                false,
                false,
                false,
                false);
    }
}
