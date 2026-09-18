// Package eml is the library's entire public surface.
//
// NewError(code) / NewErrorWithLanguage(code, language) resolve code against the Error
// Management UI's public lookup API — configured via the APPNAME, EML_API, and ENVIRONMENT
// environment variables — and always produce a usable *EMLError. If EML itself can't be
// reached, or returns something this library can't use, a local fallback message is used
// instead; neither function ever panics because of a lookup failure, and neither ever returns
// nil. That resilience is the entire point of this library: its own error handling must never
// itself crash the calling application.
//
// Go has no exceptions to throw/raise, so there's no literal port of
// `throw new EMLError(code)` (Java) / `raise EMLError(code)` (Python). Go's own idiom is to
// *return* an error value rather than throw one, so the direct, correct translation is a
// constructor function you return from wherever the calling code needs to produce an error:
//
//	if !paymentSucceeded {
//	    return eml.NewError("PAYMENT_DECLINED")
//	}
//
// Despite Go having no constructors in the OOP sense, NewError/NewErrorWithLanguage still
// match Java's and Python's *synchronous* resolution shape exactly, and are NOT forced into
// the JavaScript library's async-factory workaround: Node's fetch always returns a Promise, so
// a JS constructor alone can never resolve real data before the object exists. Go's
// net/http Client.Do (like Java's HttpClient.send() and Python's urllib.request.urlopen) is a
// normal, synchronous, blocking call — so NewError/NewErrorWithLanguage can perform the HTTP
// call and JSON resolution immediately, inline, and return a fully-resolved *EMLError, the
// same way Java's constructor and Python's __init__ do.
package eml

import (
	"fmt"
	"log"
)

// EMLError is a plain struct, satisfying the standard library's error interface via Error().
// Every field from the lookup response is exposed as a plain exported struct field, using Go's
// idiomatic capitalized-initialism naming convention (HTTPCode, not HttpCode; RedirectURL, not
// RedirectUrl; EventID, not EventId) — a deliberate naming-convention difference from the other
// three libraries' own idioms (Java getters close to the JSON field names, JS camelCase
// readonly properties, Python snake_case attributes), not an inconsistency: the underlying
// lookup response fields are identical across all four libraries, only the surface spelling
// differs per ecosystem.
//
// Resolved distinguishes a real, authored EML response (true) from a local fallback (false) —
// the one signal the server JSON can never carry itself.
type EMLError struct {
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

// Compile-time confirmation that *EMLError satisfies the standard library error interface.
var _ error = (*EMLError)(nil)

// Error implements the standard library error interface.
func (e *EMLError) Error() string {
	return fmt.Sprintf("%s: %s", e.Code, e.FriendlyMessage)
}

// NewError resolves code against the EML lookup API (APPNAME/EML_API/ENVIRONMENT environment
// variables, language defaulting to "en") and always returns a usable *EMLError — never nil,
// and this function itself never panics due to a lookup failure. If EML can't be reached or
// returns something unusable, the returned EMLError carries a local fallback message and
// Resolved is false.
func NewError(code string) *EMLError {
	return NewErrorWithLanguage(code, defaultLanguage())
}

// NewErrorWithLanguage is NewError with an explicit language override instead of the "en"
// default.
func NewErrorWithLanguage(code, language string) *EMLError {
	result, err := lookup(appName(), apiBaseURL(), environment(), code, language)
	if err != nil {
		log.Printf("EML lookup failed for code %q: %v", code, err)
		result = localFallback(code)
	}

	return &EMLError{
		Code:             result.Code,
		AppName:          result.AppName,
		Environment:      result.Environment,
		Language:         result.Language,
		Header:           result.Header,
		Description:      result.Description,
		FriendlyMessage:  result.FriendlyMessage,
		Category:         result.Category,
		ErrorCategory:    result.ErrorCategory,
		HTTPCode:         result.HTTPCode,
		AlertString:      result.AlertString,
		RedirectURL:      result.RedirectURL,
		EventID:          result.EventID,
		EventCategory:    result.EventCategory,
		TransIDDisplay:   result.TransIDDisplay,
		RetryEnabled:     result.RetryEnabled,
		ErrorCodeDisplay: result.ErrorCodeDisplay,
		NeedsAuthoring:   result.NeedsAuthoring,
		Resolved:         result.Resolved,
	}
}
