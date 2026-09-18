package eml

import "fmt"

// lookupResult is the internal representation of the EML lookup API's JSON response (see
// error-management-ui/src/app/api/v1/lookup/route.ts and docs/error-code-schema.md —
// "Response shape (sketch)"), plus one library-only field: Resolved. Resolved is true for a
// real server response and false for a localFallback result — the one signal the server JSON
// can never itself carry, since a fallback is built entirely on the client with no server
// involved.
//
// Field names deliberately use Go's idiomatic capitalized-initialism convention (HTTPCode, not
// HttpCode; RedirectURL, not RedirectUrl; EventID, not EventId) even though this struct itself
// is unexported — this is the same spelling the exported EMLError struct (error.go) uses, kept
// consistent between the two. Every other client library made an analogous naming-convention
// choice for its own ecosystem: Java kept getter names close to the JSON field names, JS kept
// camelCase readonly properties, Python uses snake_case attributes per PEP 8. The underlying
// fields are identical across all four libraries — only the surface spelling differs.
type lookupResult struct {
	Code             string
	AppName          string
	Environment      string
	Language         string
	Header           string
	Description      string
	FriendlyMessage  string
	Category         string
	ErrorCategory    string
	HTTPCode         int
	AlertString      string
	RedirectURL      *string
	EventID          *string
	EventCategory    *string
	TransIDDisplay   bool
	RetryEnabled     bool
	ErrorCodeDisplay bool
	NeedsAuthoring   bool
	Resolved         bool
}

// localFallback builds a local, client-only result used when EML could not be reached or its
// response could not be used (bad config, network failure, non-2xx status, unparseable/
// incomplete body). NeedsAuthoring is false here — not true — because that flag describes a
// real server-side "no owner has authored this code yet" state, and no database row was ever
// touched to make that determination; it simply doesn't apply.
//
// Kept in sync with the Java library's LookupResult.localFallback(String), the JavaScript
// library's localFallback(code), and the Python library's LookupResult.local_fallback(code)
// for consistency across client libraries: same header, same friendly-message format, same
// HTTP code, same zero/empty values everywhere else.
func localFallback(code string) lookupResult {
	return lookupResult{
		Code:        code,
		AppName:     "",
		Environment: "",
		Language:    "",
		Header:      "Error Handling Unavailable",
		Description: "",
		FriendlyMessage: fmt.Sprintf(
			"An error occurred (code: %s), but the Error Message Library could not be reached. "+
				"Please try again later or contact support.",
			code,
		),
		Category:         "",
		ErrorCategory:    "",
		HTTPCode:         500,
		AlertString:      "",
		RedirectURL:      nil,
		EventID:          nil,
		EventCategory:    nil,
		TransIDDisplay:   false,
		RetryEnabled:     false,
		ErrorCodeDisplay: false,
		NeedsAuthoring:   false,
		Resolved:         false,
	}
}
