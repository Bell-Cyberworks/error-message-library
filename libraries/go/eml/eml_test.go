package eml

import (
	"os"
	"testing"
)

// TestLookupAgainstLiveServer is a real integration test, but it must never fail a normal
// `go test` run just because no live error-management-ui instance happens to be running — this
// project has none running during ordinary development. The standard Go idiom for that is an
// env-var-gated t.Skip.
//
// Run it explicitly, one scenario per invocation (a known-existing code, a brand-new/
// never-before-seen code to exercise server-side auto-registration, an unreachable EML_API to
// exercise the local fallback, an unregistered APPNAME/ENVIRONMENT, or a missing required
// env var to exercise the no-network-attempt validation failure):
//
//	EML_INTEGRATION_TEST=1 APPNAME=my-app EML_API=http://localhost:3000 ENVIRONMENT=dev \
//	  EML_TEST_CODE=SOME_CODE go test ./eml/... -run TestLookupAgainstLiveServer -v
func TestLookupAgainstLiveServer(t *testing.T) {
	if os.Getenv("EML_INTEGRATION_TEST") == "" {
		t.Skip("set EML_INTEGRATION_TEST=1 (with APPNAME/EML_API/ENVIRONMENT also set) to run this against a live error-management-ui instance")
	}
	code := os.Getenv("EML_TEST_CODE")
	if code == "" {
		t.Fatal("EML_TEST_CODE must be set when EML_INTEGRATION_TEST=1")
	}

	result := NewError(code)

	t.Logf(
		"RESULT resolved=%v code=%q appname=%q environment=%q language=%q header=%q "+
			"description=%q friendlyMessage=%q category=%q errorCategory=%q httpCode=%d "+
			"alertString=%q redirectURL=%s eventID=%s eventCategory=%s transIDDisplay=%v "+
			"retryEnabled=%v errorCodeDisplay=%v needsAuthoring=%v errorString=%q",
		result.Resolved, result.Code, result.AppName, result.Environment, result.Language,
		result.Header, result.Description, result.FriendlyMessage, result.Category,
		result.ErrorCategory, result.HTTPCode, result.AlertString,
		stringPtrOrNil(result.RedirectURL), stringPtrOrNil(result.EventID),
		stringPtrOrNil(result.EventCategory), result.TransIDDisplay, result.RetryEnabled,
		result.ErrorCodeDisplay, result.NeedsAuthoring, result.Error(),
	)

	if result.Code != code {
		t.Errorf("expected Code to echo the requested code %q, got %q", code, result.Code)
	}
	if result.Header == "" || result.FriendlyMessage == "" {
		t.Error("expected non-empty Header and FriendlyMessage regardless of resolution outcome")
	}
}

func stringPtrOrNil(value *string) string {
	if value == nil {
		return "<nil>"
	}
	return *value
}

// TestNewErrorNeverReturnsNilAndFallsBackWhenUnconfigured exercises the no-network-attempt
// validation failure without requiring a live server: blank configuration must produce a local
// fallback, not a panic or a nil *EMLError.
func TestNewErrorNeverReturnsNilAndFallsBackWhenUnconfigured(t *testing.T) {
	t.Setenv("APPNAME", "")
	t.Setenv("EML_API", "")
	t.Setenv("ENVIRONMENT", "")

	result := NewError("SOME_CODE")

	if result == nil {
		t.Fatal("NewError must never return nil")
	}
	if result.Resolved {
		t.Error("expected Resolved == false when required configuration is missing")
	}
	if result.Header != "Error Handling Unavailable" {
		t.Errorf("expected the local fallback header, got %q", result.Header)
	}
	if result.Code != "SOME_CODE" {
		t.Errorf("expected the fallback Code to echo the requested code, got %q", result.Code)
	}
	if result.HTTPCode != 500 {
		t.Errorf("expected the fallback HTTPCode to be 500, got %d", result.HTTPCode)
	}
}

func TestNewErrorWithLanguageDefaultsMatchNewError(t *testing.T) {
	if defaultLanguage() != "en" {
		t.Errorf(`expected defaultLanguage() to be "en", got %q`, defaultLanguage())
	}
}

func TestEMLErrorSatisfiesTheErrorInterface(t *testing.T) {
	result := &EMLError{Code: "C1", FriendlyMessage: "something went wrong"}

	var err error = result
	if err.Error() != "C1: something went wrong" {
		t.Errorf("unexpected Error() string: %q", err.Error())
	}
}

func TestLocalFallback(t *testing.T) {
	result := localFallback("ABC123")

	if result.Resolved {
		t.Error("localFallback result must have Resolved == false")
	}
	if result.Header != "Error Handling Unavailable" {
		t.Errorf("unexpected header: %q", result.Header)
	}
	wantMessage := "An error occurred (code: ABC123), but the Error Message Library could not " +
		"be reached. Please try again later or contact support."
	if result.FriendlyMessage != wantMessage {
		t.Errorf("unexpected friendly message: %q", result.FriendlyMessage)
	}
	if result.HTTPCode != 500 {
		t.Errorf("expected HTTPCode 500, got %d", result.HTTPCode)
	}
	if result.NeedsAuthoring {
		t.Error("localFallback must not set NeedsAuthoring")
	}
	if result.RedirectURL != nil || result.EventID != nil || result.EventCategory != nil {
		t.Error("localFallback nullable fields must be nil")
	}
}

func TestLookupRejectsMissingConfiguration(t *testing.T) {
	cases := []struct {
		name        string
		appName     string
		apiBaseURL  string
		environment string
	}{
		{"blank appName", "", "http://localhost:3000", "dev"},
		{"blank apiBaseURL", "app", "   ", "dev"},
		{"blank environment", "app", "http://localhost:3000", ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := lookup(tc.appName, tc.apiBaseURL, tc.environment, "CODE", "en"); err == nil {
				t.Error("expected lookup to fail without attempting a network call")
			}
		})
	}
}

func TestParseResponseFieldHelpers(t *testing.T) {
	parsed := map[string]interface{}{
		"httpCode":       float64(404),
		"transIdDisplay": true,
		"redirectUrl":    "https://example.com",
		"wrongTypeBool":  "not-a-bool",
		"wrongTypeInt":   "not-a-number",
	}

	if got := intOrDefault(parsed, "httpCode", 0); got != 404 {
		t.Errorf("intOrDefault: got %d, want 404", got)
	}
	if got := intOrDefault(parsed, "missing", 7); got != 7 {
		t.Errorf("intOrDefault default: got %d, want 7", got)
	}
	if got := intOrDefault(parsed, "wrongTypeInt", 9); got != 9 {
		t.Errorf("intOrDefault wrong-type default: got %d, want 9", got)
	}

	if got := boolOrDefault(parsed, "transIdDisplay", false); got != true {
		t.Errorf("boolOrDefault: got %v, want true", got)
	}
	if got := boolOrDefault(parsed, "wrongTypeBool", false); got != false {
		t.Errorf("boolOrDefault should fall back on wrong type, got %v", got)
	}

	if got := nullableString(parsed, "redirectUrl"); got == nil || *got != "https://example.com" {
		t.Errorf("nullableString: got %v", got)
	}
	if got := nullableString(parsed, "missing"); got != nil {
		t.Errorf("nullableString should be nil for a missing key, got %v", got)
	}
}

func TestParseResponseRequiresHeaderAndFriendlyMessage(t *testing.T) {
	body := []byte(`{"description":"no header or friendlyMessage here"}`)

	if _, err := parseResponse(body, "CODE", "app", "dev", "en"); err == nil {
		t.Error("expected an error when header/friendlyMessage are missing")
	}
}

func TestParseResponseUsesLenientDefaultsForOptionalFields(t *testing.T) {
	body := []byte(`{"header":"H","friendlyMessage":"FM","httpCode":"not-a-number"}`)

	result, err := parseResponse(body, "CODE", "app", "dev", "en")
	if err != nil {
		t.Fatalf("expected a lenient parse, got error: %v", err)
	}
	if result.Header != "H" || result.FriendlyMessage != "FM" {
		t.Errorf("unexpected required fields: header=%q friendlyMessage=%q", result.Header, result.FriendlyMessage)
	}
	if result.HTTPCode != 0 {
		t.Errorf("expected a wrong-typed httpCode to fall back to 0, got %d", result.HTTPCode)
	}
	if !result.Resolved {
		t.Error("expected Resolved == true for a successfully parsed response")
	}
}
