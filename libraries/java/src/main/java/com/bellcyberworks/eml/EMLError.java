package com.bellcyberworks.eml;

import java.util.logging.Logger;

/**
 * The library's entire public surface.
 *
 * <p>Throwing {@code new EMLError(code)} resolves {@code code} against the Error Management
 * UI's public lookup API — configured via the {@code APPNAME}, {@code EML_API},
 * {@code ENVIRONMENT}, and {@code EML_API_KEY} environment variables — and always produces a
 * usable exception. If EML
 * itself can't be reached, or returns something this library can't use, a local fallback
 * message is used instead; nothing but a successfully-constructed {@code EMLError} ever
 * escapes either public constructor. That resilience is the entire point of this library: its
 * own error handling must never itself crash the calling application.
 */
public final class EMLError extends RuntimeException {

    private static final Logger LOGGER = Logger.getLogger(EMLError.class.getName());

    private final String code;
    private final String appname;
    private final String environment;
    private final String language;
    private final String header;
    private final String description;
    private final String friendlyMessage;
    private final String category;
    private final String errorCategory;
    private final int httpCode;
    private final String alertString;
    private final String redirectUrl;
    private final String eventId;
    private final String eventCategory;
    private final boolean transIdDisplay;
    private final boolean retryEnabled;
    private final boolean errorCodeDisplay;
    private final boolean needsAuthoring;
    private final boolean resolved;

    public EMLError(String code) {
        this(code, EMLConfig.defaultLanguage());
    }

    public EMLError(String code, String language) {
        this(code, resolve(code, language));
    }

    private EMLError(String code, LookupResult r) {
        super(r.code() != null && !r.code().isEmpty()
                ? r.code() + ": " + r.friendlyMessage()
                : code + ": " + r.friendlyMessage());
        this.code = r.code();
        this.appname = r.appname();
        this.environment = r.environment();
        this.language = r.language();
        this.header = r.header();
        this.description = r.description();
        this.friendlyMessage = r.friendlyMessage();
        this.category = r.category();
        this.errorCategory = r.errorCategory();
        this.httpCode = r.httpCode();
        this.alertString = r.alertString();
        this.redirectUrl = r.redirectUrl();
        this.eventId = r.eventId();
        this.eventCategory = r.eventCategory();
        this.transIdDisplay = r.transIdDisplay();
        this.retryEnabled = r.retryEnabled();
        this.errorCodeDisplay = r.errorCodeDisplay();
        this.needsAuthoring = r.needsAuthoring();
        this.resolved = r.resolved();
    }

    private static LookupResult resolve(String code, String language) {
        try {
            return EMLLookupClient.lookup(
                    EMLConfig.appName(), EMLConfig.apiBaseUrl(), EMLConfig.environment(), EMLConfig.apiKey(),
                    code, language);
        } catch (RuntimeException | EMLLookupFailedException e) {
            // A real Error (e.g. OutOfMemoryError) is deliberately NOT caught here and is
            // left to propagate — only expected, recoverable failure modes fall back.
            LOGGER.warning("EML lookup failed for code '" + code + "': " + e.getMessage());
            return LookupResult.localFallback(code);
        }
    }

    public String getCode() {
        return code;
    }

    public String getAppname() {
        return appname;
    }

    public String getEnvironment() {
        return environment;
    }

    public String getLanguage() {
        return language;
    }

    public String getHeader() {
        return header;
    }

    public String getDescription() {
        return description;
    }

    public String getFriendlyMessage() {
        return friendlyMessage;
    }

    public String getCategory() {
        return category;
    }

    public String getErrorCategory() {
        return errorCategory;
    }

    public int getHttpCode() {
        return httpCode;
    }

    public String getAlertString() {
        return alertString;
    }

    public String getRedirectUrl() {
        return redirectUrl;
    }

    public String getEventId() {
        return eventId;
    }

    public String getEventCategory() {
        return eventCategory;
    }

    public boolean isTransIdDisplay() {
        return transIdDisplay;
    }

    public boolean isRetryEnabled() {
        return retryEnabled;
    }

    public boolean isErrorCodeDisplay() {
        return errorCodeDisplay;
    }

    public boolean isNeedsAuthoring() {
        return needsAuthoring;
    }

    public boolean isResolved() {
        return resolved;
    }
}
