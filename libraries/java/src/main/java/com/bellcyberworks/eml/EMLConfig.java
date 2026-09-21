package com.bellcyberworks.eml;

/**
 * Reads library configuration from environment variables, lazily — at lookup time, never in
 * a static initializer. A missing or blank environment variable must never be able to crash
 * class loading, since that would break the very exception type ({@link EMLError}) whose
 * entire job is to report configuration and lookup failures gracefully instead of crashing
 * the calling application.
 */
final class EMLConfig {

    private EMLConfig() {
    }

    static String appName() {
        return System.getenv("APPNAME");
    }

    static String apiBaseUrl() {
        return System.getenv("EML_API");
    }

    static String environment() {
        return System.getenv("ENVIRONMENT");
    }

    static String apiKey() {
        return System.getenv("EML_API_KEY");
    }

    /**
     * No {@code LANGUAGE} environment variable exists. This mirrors the server's own default
     * in {@code resolveLanguage()}
     * (error-management-ui/src/app/api/v1/lookup/route.ts) for a missing/absent
     * {@code Accept-Language} header.
     */
    static String defaultLanguage() {
        return "en";
    }
}
