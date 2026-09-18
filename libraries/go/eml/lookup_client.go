package eml

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// requestTimeout covers the whole connect+read cycle in a single value. Go's plain
// http.Client.Timeout doesn't split connect vs. read phases any more than Node's fetch
// (AbortSignal.timeout) or Python's urlopen(timeout=...) do — this is the same idiomatic
// single-combined-timeout adaptation the JavaScript and Python libraries already made, for the
// same underlying reason, rather than a novel decision made fresh here.
const requestTimeout = 3 * time.Second

// lookup calls the Error Management UI's public lookup endpoint —
// GET /api/v1/lookup?application=&code=&environment= with an Accept-Language header for
// language (see error-management-ui/src/app/api/v1/lookup/route.ts) — and translates a
// successful response into a lookupResult.
//
// Every failure mode (bad configuration, network failure, non-2xx HTTP status, unparseable or
// unusable response body) is signaled by returning a non-nil error; this function never itself
// decides to fall back — that's NewError/NewErrorWithLanguage's job (see error.go).
func lookup(appName, apiBaseURL, environment, code, language string) (lookupResult, error) {
	if strings.TrimSpace(appName) == "" ||
		strings.TrimSpace(apiBaseURL) == "" ||
		strings.TrimSpace(environment) == "" {
		return lookupResult{}, fmt.Errorf(
			"missing required configuration: APPNAME, EML_API, and ENVIRONMENT must all be set",
		)
	}

	baseURL := strings.TrimSuffix(apiBaseURL, "/")

	query := url.Values{}
	query.Set("application", appName)
	query.Set("code", code)
	query.Set("environment", environment)
	fullURL := baseURL + "/api/v1/lookup?" + query.Encode()

	request, err := http.NewRequest(http.MethodGet, fullURL, nil)
	if err != nil {
		return lookupResult{}, fmt.Errorf("could not build EML lookup request for code %q: %w", code, err)
	}
	request.Header.Set("Accept-Language", language)

	client := &http.Client{Timeout: requestTimeout}

	response, err := client.Do(request)
	if err != nil {
		return lookupResult{}, fmt.Errorf("EML lookup request failed for code %q: %w", code, err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return lookupResult{}, fmt.Errorf(
			"EML lookup for code %q returned HTTP %d", code, response.StatusCode,
		)
	}

	body, err := io.ReadAll(response.Body)
	if err != nil {
		return lookupResult{}, fmt.Errorf(
			"EML lookup response body for code %q could not be read: %w", code, err,
		)
	}

	return parseResponse(body, code, appName, environment, language)
}

// parseResponse unmarshals into an untyped map[string]interface{} first — deliberately NOT
// directly into a typed struct. encoding/json fails the entire Unmarshal call if a single JSON
// field's type doesn't match a typed struct field, which would break the lenient
// per-field-default policy every other client library in this project implements (a missing or
// unexpectedly-typed field falls back to a safe default rather than failing the whole parse).
// header and friendlyMessage are the two exceptions: both are required, and their absence (or
// wrong type) fails the lookup outright, same as the Java/JS/Python libraries.
func parseResponse(body []byte, code, appName, environment, language string) (lookupResult, error) {
	var parsed map[string]interface{}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return lookupResult{}, fmt.Errorf("EML lookup response for code %q was not valid JSON: %w", code, err)
	}

	headerValue, headerOK := parsed["header"].(string)
	friendlyMessageValue, friendlyOK := parsed["friendlyMessage"].(string)
	if !headerOK || !friendlyOK {
		return lookupResult{}, fmt.Errorf(
			"EML lookup response for code %q is missing required string field(s) 'header'/'friendlyMessage'",
			code,
		)
	}

	return lookupResult{
		Code:             stringOrDefault(parsed, "code", code),
		AppName:          stringOrDefault(parsed, "appname", appName),
		Environment:      stringOrDefault(parsed, "environment", environment),
		Language:         stringOrDefault(parsed, "language", language),
		Header:           headerValue,
		Description:      stringOrDefault(parsed, "description", ""),
		FriendlyMessage:  friendlyMessageValue,
		Category:         stringOrDefault(parsed, "category", ""),
		ErrorCategory:    stringOrDefault(parsed, "errorCategory", ""),
		HTTPCode:         intOrDefault(parsed, "httpCode", 0),
		AlertString:      stringOrDefault(parsed, "alertString", ""),
		RedirectURL:      nullableString(parsed, "redirectUrl"),
		EventID:          nullableString(parsed, "eventId"),
		EventCategory:    nullableString(parsed, "eventCategory"),
		TransIDDisplay:   boolOrDefault(parsed, "transIdDisplay", false),
		RetryEnabled:     boolOrDefault(parsed, "retryEnabled", false),
		ErrorCodeDisplay: boolOrDefault(parsed, "errorCodeDisplay", false),
		NeedsAuthoring:   boolOrDefault(parsed, "needsAuthoring", false),
		Resolved:         true,
	}, nil
}

func stringOrDefault(fields map[string]interface{}, key, defaultValue string) string {
	if value, ok := fields[key].(string); ok {
		return value
	}
	return defaultValue
}

func nullableString(fields map[string]interface{}, key string) *string {
	if value, ok := fields[key].(string); ok {
		return &value
	}
	return nil
}

// intOrDefault reads an int-typed field out of a JSON-decoded map[string]interface{}.
// encoding/json decodes every JSON number into a Go float64 when the destination is
// interface{}, so httpCode needs an explicit float64 -> int conversion (the same kind of
// adaptation Java makes for Long/Double and Python makes explicitly for int/float).
//
// Unlike Python, Go's map[string]interface{} JSON decoding does NOT need a bool-vs-number
// guard here: encoding/json decodes a JSON boolean into a genuine Go bool, a distinct dynamic
// type from float64, so a type assertion to float64 already excludes bool values on its own —
// there's no Go analogue to Python's "bool is a subclass of int" surprise.
func intOrDefault(fields map[string]interface{}, key string, defaultValue int) int {
	if value, ok := fields[key].(float64); ok {
		return int(value)
	}
	return defaultValue
}

func boolOrDefault(fields map[string]interface{}, key string, defaultValue bool) bool {
	if value, ok := fields[key].(bool); ok {
		return value
	}
	return defaultValue
}
