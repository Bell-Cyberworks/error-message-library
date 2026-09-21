package com.bellcyberworks.eml;

import com.bellcyberworks.eml.json.JsonParseException;
import com.bellcyberworks.eml.json.MinimalJsonReader;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/**
 * Calls the Error Management UI's public lookup endpoint —
 * {@code GET /api/v1/lookup?application=&code=&environment=} with an {@code Accept-Language}
 * header for language and an {@code Authorization: Bearer <key>} header for authentication
 * (see error-management-ui/src/app/api/v1/lookup/route.ts) — and translates a successful
 * response into a {@link LookupResult}.
 *
 * <p>Every failure mode (bad configuration, network failure, non-2xx status, unparseable or
 * unusable response body) is signaled by throwing {@link EMLLookupFailedException}; this
 * class never itself decides to fall back — that's {@link EMLError}'s job.
 */
final class EMLLookupClient {

    private EMLLookupClient() {
    }

    static LookupResult lookup(
            String appname, String apiBaseUrl, String environment, String apiKey, String code, String language)
            throws EMLLookupFailedException {
        if (isBlank(appname) || isBlank(apiBaseUrl) || isBlank(environment) || isBlank(apiKey)) {
            throw new EMLLookupFailedException(
                    "Missing required configuration: APPNAME, EML_API, ENVIRONMENT, and EML_API_KEY must all be set");
        }

        String baseUrl = apiBaseUrl.endsWith("/") ? apiBaseUrl.substring(0, apiBaseUrl.length() - 1) : apiBaseUrl;
        String url = baseUrl + "/api/v1/lookup"
                + "?application=" + encode(appname)
                + "&code=" + encode(code)
                + "&environment=" + encode(environment);

        // HTTP/1.1 explicitly: the JDK HttpClient's default HTTP_2 preference attempts an h2c
        // (cleartext HTTP/2) upgrade on every plaintext connection, which most real HTTP
        // servers — including error-management-ui's own Next.js dev server, confirmed by
        // hand during this library's verification — don't support, and the connection fails
        // outright (an EOF while still reading headers) rather than falling back to HTTP/1.1.
        // EML's public lookup API has no reason to need HTTP/2, so this avoids the whole
        // failure class rather than depending on servers advertising h2c support correctly.
        HttpClient client = HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(Duration.ofSeconds(2))
                .build();

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .header("Accept-Language", language)
                .header("Authorization", "Bearer " + apiKey)
                .timeout(Duration.ofSeconds(3))
                .GET()
                .build();

        HttpResponse<String> response;
        try {
            response = client.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (IOException e) {
            throw new EMLLookupFailedException("EML lookup request failed for code '" + code + "'", e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new EMLLookupFailedException("EML lookup interrupted for code '" + code + "'", e);
        }

        int status = response.statusCode();
        if (status < 200 || status >= 300) {
            throw new EMLLookupFailedException(
                    "EML lookup for code '" + code + "' returned HTTP " + status);
        }

        return parseResponse(response.body(), code, appname, environment, language);
    }

    private static LookupResult parseResponse(
            String body, String code, String appname, String environment, String language)
            throws EMLLookupFailedException {
        Map<String, Object> json;
        try {
            json = MinimalJsonReader.parseObject(body);
        } catch (JsonParseException e) {
            throw new EMLLookupFailedException(
                    "EML lookup response for code '" + code + "' was not valid JSON", e);
        }

        // header and friendlyMessage are the two fields the rest of this library can't
        // function without; every other field is deliberately lenient (safe per-field
        // default) so a future server-side change doesn't break old client versions.
        Object headerValue = json.get("header");
        Object friendlyMessageValue = json.get("friendlyMessage");
        if (!(headerValue instanceof String) || !(friendlyMessageValue instanceof String)) {
            throw new EMLLookupFailedException(
                    "EML lookup response for code '" + code
                            + "' is missing required string field(s) 'header'/'friendlyMessage'");
        }

        return new LookupResult(
                stringOrDefault(json, "code", code),
                stringOrDefault(json, "appname", appname),
                stringOrDefault(json, "environment", environment),
                stringOrDefault(json, "language", language),
                (String) headerValue,
                stringOrDefault(json, "description", ""),
                (String) friendlyMessageValue,
                stringOrDefault(json, "category", ""),
                stringOrDefault(json, "errorCategory", ""),
                intOrDefault(json, "httpCode", 0),
                stringOrDefault(json, "alertString", ""),
                nullableString(json, "redirectUrl"),
                nullableString(json, "eventId"),
                nullableString(json, "eventCategory"),
                booleanOrDefault(json, "transIdDisplay", false),
                booleanOrDefault(json, "retryEnabled", false),
                booleanOrDefault(json, "errorCodeDisplay", false),
                booleanOrDefault(json, "needsAuthoring", false),
                true);
    }

    private static boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private static String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8);
    }

    private static String stringOrDefault(Map<String, Object> json, String key, String defaultValue) {
        Object value = json.get(key);
        return value instanceof String ? (String) value : defaultValue;
    }

    private static String nullableString(Map<String, Object> json, String key) {
        Object value = json.get(key);
        return value instanceof String ? (String) value : null;
    }

    private static int intOrDefault(Map<String, Object> json, String key, int defaultValue) {
        Object value = json.get(key);
        if (value instanceof Long l) {
            return l.intValue();
        }
        if (value instanceof Double d) {
            return d.intValue();
        }
        return defaultValue;
    }

    private static boolean booleanOrDefault(Map<String, Object> json, String key, boolean defaultValue) {
        Object value = json.get(key);
        return value instanceof Boolean b ? b : defaultValue;
    }
}
