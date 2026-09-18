package com.bellcyberworks.eml.json;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * A narrow, single-pass recursive-descent JSON reader sufficient for exactly the flat object
 * shape returned by the EML lookup API (see
 * error-management-ui/src/app/api/v1/lookup/route.ts): a single {@code {...}} object whose
 * values are strings, integers, booleans, or {@code null}.
 *
 * <p>This is deliberately not a general-purpose JSON parser:
 * <ul>
 *   <li>Nested objects/arrays are skipped rather than modeled, so that a future server-side
 *       field addition (of a type this reader doesn't understand) doesn't break old client
 *       versions — the field is simply ignored instead of failing the whole parse.</li>
 *   <li>Malformed or unterminated JSON still throws {@link JsonParseException} — leniency
 *       applies only to unexpected-but-well-formed structure, never to broken syntax.</li>
 *   <li>No JSON encoder is provided. This library only ever performs {@code GET} requests
 *       with query parameters; it never sends a JSON body.</li>
 * </ul>
 */
public final class MinimalJsonReader {

    private MinimalJsonReader() {
    }

    /**
     * Parses {@code json} as a single flat JSON object and returns its key/value pairs.
     * Values are returned as {@code String}, {@code Long}, {@code Double}, {@code Boolean},
     * or {@code null}; nested object/array values are skipped and reported as {@code null}.
     */
    public static Map<String, Object> parseObject(String json) throws JsonParseException {
        Parser parser = new Parser(json);
        parser.skipWhitespace();
        Map<String, Object> result = parser.parseObject();
        parser.skipWhitespace();
        if (!parser.atEnd()) {
            throw new JsonParseException("Unexpected trailing content at position " + parser.pos);
        }
        return result;
    }

    private static final class Parser {
        private final String s;
        private int pos;

        Parser(String s) {
            this.s = s == null ? "" : s;
        }

        boolean atEnd() {
            return pos >= s.length();
        }

        char peek() throws JsonParseException {
            if (atEnd()) {
                throw new JsonParseException("Unexpected end of JSON input");
            }
            return s.charAt(pos);
        }

        char next() throws JsonParseException {
            char c = peek();
            pos++;
            return c;
        }

        void expect(char expected) throws JsonParseException {
            char c = next();
            if (c != expected) {
                throw new JsonParseException(
                        "Expected '" + expected + "' at position " + (pos - 1) + " but found '" + c + "'");
            }
        }

        void skipWhitespace() {
            while (pos < s.length() && Character.isWhitespace(s.charAt(pos))) {
                pos++;
            }
        }

        Map<String, Object> parseObject() throws JsonParseException {
            Map<String, Object> map = new LinkedHashMap<>();
            expect('{');
            skipWhitespace();
            if (!atEnd() && peek() == '}') {
                pos++;
                return map;
            }
            while (true) {
                skipWhitespace();
                String key = parseString();
                skipWhitespace();
                expect(':');
                skipWhitespace();
                Object value = parseValue();
                map.put(key, value);
                skipWhitespace();
                char c = next();
                if (c == ',') {
                    continue;
                } else if (c == '}') {
                    break;
                } else {
                    throw new JsonParseException("Expected ',' or '}' at position " + (pos - 1));
                }
            }
            return map;
        }

        Object parseValue() throws JsonParseException {
            char c = peek();
            switch (c) {
                case '"':
                    return parseString();
                case '{':
                    skipObject();
                    return null;
                case '[':
                    skipArray();
                    return null;
                case 't':
                    expectLiteral("true");
                    return Boolean.TRUE;
                case 'f':
                    expectLiteral("false");
                    return Boolean.FALSE;
                case 'n':
                    expectLiteral("null");
                    return null;
                default:
                    if (c == '-' || Character.isDigit(c)) {
                        return parseNumber();
                    }
                    throw new JsonParseException("Unexpected character '" + c + "' at position " + pos);
            }
        }

        void expectLiteral(String literal) throws JsonParseException {
            if (pos + literal.length() > s.length() || !s.regionMatches(pos, literal, 0, literal.length())) {
                throw new JsonParseException("Expected literal '" + literal + "' at position " + pos);
            }
            pos += literal.length();
        }

        String parseString() throws JsonParseException {
            expect('"');
            StringBuilder sb = new StringBuilder();
            while (true) {
                char c = next();
                if (c == '"') {
                    break;
                }
                if (c == '\\') {
                    char esc = next();
                    switch (esc) {
                        case '"':
                            sb.append('"');
                            break;
                        case '\\':
                            sb.append('\\');
                            break;
                        case '/':
                            sb.append('/');
                            break;
                        case 'n':
                            sb.append('\n');
                            break;
                        case 't':
                            sb.append('\t');
                            break;
                        case 'r':
                            sb.append('\r');
                            break;
                        case 'b':
                            sb.append('\b');
                            break;
                        case 'f':
                            sb.append('\f');
                            break;
                        case 'u':
                            if (pos + 4 > s.length()) {
                                throw new JsonParseException("Truncated \\u escape at position " + pos);
                            }
                            String hex = s.substring(pos, pos + 4);
                            try {
                                sb.append((char) Integer.parseInt(hex, 16));
                            } catch (NumberFormatException e) {
                                throw new JsonParseException("Invalid \\u escape '" + hex + "' at position " + pos);
                            }
                            pos += 4;
                            break;
                        default:
                            throw new JsonParseException(
                                    "Unsupported escape sequence '\\" + esc + "' at position " + (pos - 1));
                    }
                } else {
                    sb.append(c);
                }
            }
            return sb.toString();
        }

        Object parseNumber() throws JsonParseException {
            int start = pos;
            if (peek() == '-') {
                pos++;
            }
            while (!atEnd() && Character.isDigit(peek())) {
                pos++;
            }
            boolean isFloat = false;
            if (!atEnd() && peek() == '.') {
                isFloat = true;
                pos++;
                while (!atEnd() && Character.isDigit(peek())) {
                    pos++;
                }
            }
            if (!atEnd() && (peek() == 'e' || peek() == 'E')) {
                isFloat = true;
                pos++;
                if (!atEnd() && (peek() == '+' || peek() == '-')) {
                    pos++;
                }
                while (!atEnd() && Character.isDigit(peek())) {
                    pos++;
                }
            }
            String numStr = s.substring(start, pos);
            if (numStr.isEmpty() || "-".equals(numStr)) {
                throw new JsonParseException("Invalid number at position " + start);
            }
            try {
                if (isFloat) {
                    return Double.parseDouble(numStr);
                }
                return Long.parseLong(numStr);
            } catch (NumberFormatException e) {
                throw new JsonParseException("Invalid number '" + numStr + "' at position " + start);
            }
        }

        /** Skips a nested {@code {...}} value whose contents this reader doesn't model. */
        void skipObject() throws JsonParseException {
            expect('{');
            int depth = 1;
            while (depth > 0) {
                if (atEnd()) {
                    throw new JsonParseException("Unterminated object");
                }
                char c = next();
                if (c == '"') {
                    pos--; // step back so parseString() consumes the opening quote itself
                    parseString();
                } else if (c == '{') {
                    depth++;
                } else if (c == '}') {
                    depth--;
                }
            }
        }

        /** Skips a nested {@code [...]} value whose contents this reader doesn't model. */
        void skipArray() throws JsonParseException {
            expect('[');
            int depth = 1;
            while (depth > 0) {
                if (atEnd()) {
                    throw new JsonParseException("Unterminated array");
                }
                char c = next();
                if (c == '"') {
                    pos--; // step back so parseString() consumes the opening quote itself
                    parseString();
                } else if (c == '[') {
                    depth++;
                } else if (c == ']') {
                    depth--;
                }
            }
        }
    }
}
