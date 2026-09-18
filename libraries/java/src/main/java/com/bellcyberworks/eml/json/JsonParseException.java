package com.bellcyberworks.eml.json;

/**
 * Thrown by {@link MinimalJsonReader} when it encounters malformed or unterminated JSON.
 * This is the "dedicated small parse-exception" thrown by the JSON layer itself; callers in
 * other packages (e.g. {@code com.bellcyberworks.eml.EMLLookupClient}) catch this and
 * translate it into their own failure signal, since Java package-private types (like
 * {@code EMLLookupFailedException}) aren't visible across package boundaries.
 */
public final class JsonParseException extends Exception {

    public JsonParseException(String message) {
        super(message);
    }
}
