# EML — Go Library

Go client implementing the [shared library contract](../README.md) against the Error
Management UI's public lookup API. Ports the design of the [Java library](../java/README.md)
and the [Python library](../python/README.md); see also the
[JavaScript/TypeScript library](../javascript/README.md) for how Node's async `fetch` forced a
different shape there.

## Design: no exceptions, so `eml.NewError(code)` is returned, not thrown — but resolved synchronously, same as Java/Python

Go has no exceptions to intercept, so there's no literal port of `throw new EMLError(code)`
(Java) or `raise EMLError(code)` (Python). Go's own idiom is to *return* an error value rather
than throw one, and `*EMLError` implements the standard library's `error` interface, so the
direct, correct translation of "throw/raise an EMLError" into Go is a constructor **function**
you `return` from wherever the calling code needs to produce an error:

```go
if !paymentSucceeded {
    return eml.NewError("PAYMENT_DECLINED")
}
```

Go has no classes/constructors in the OOP sense — `NewError`/`NewErrorWithLanguage` are plain
functions, not methods on a type, following the standard Go `NewX` constructor-function
convention. But despite that surface difference, the *resolution* still happens synchronously,
matching Java's constructor and Python's `__init__` exactly rather than being forced into the
JavaScript library's async-factory workaround: Node's `fetch` always returns a `Promise`, so a
JS constructor alone can never resolve real data before the object exists, forcing JS into a
private constructor plus a static async factory (`EMLError.forCode(...)`, `await`ed at the call
site). Go's `net/http` `Client.Do(...)` is, like Java's `HttpClient.send()` and Python's
`urllib.request.urlopen(...)`, a normal, synchronous, blocking call — not a
goroutine/channel-based async operation — so `NewError`/`NewErrorWithLanguage` perform the HTTP
call and JSON resolution immediately, inline, and return a fully-resolved `*EMLError`, no
`await`/callback/factory required.

## Usage

```go
// Configure via environment variables: APPNAME, EML_API, ENVIRONMENT
return eml.NewError("FIL1010")

// Or with an explicit language override (defaults to "en" otherwise, matching the server's own
// default):
return eml.NewErrorWithLanguage("FIL1010", "en-US")
```

`NewError`/`NewErrorWithLanguage` always resolve to *something* usable, even when EML is
unreachable or misconfigured — neither function ever panics because of a lookup failure, and
neither ever returns `nil`. If the lookup fails for any reason (missing configuration, network
failure, non-2xx response, an unparseable/unusable body), the resulting `*EMLError` carries a
local fallback message instead, and `Resolved` is `false` so callers can tell the difference
between a real, authored EML response and a fallback. A warning is logged (the standard
library's `log` package) whenever a fallback occurs.

```go
err := eml.NewError("FIL1010")
err.Header          // "Error Handling Unavailable" if EML couldn't be reached
err.FriendlyMessage
err.HTTPCode
err.Resolved        // false if this is a local fallback, true if EML answered
// ...and a plain exported struct field for every other field on the lookup response.

var e error = err   // *EMLError satisfies the standard library error interface
```

Every field is a plain exported struct field, using Go's idiomatic capitalized-initialism
naming convention — `HTTPCode` (not `HttpCode`), `RedirectURL` (not `RedirectUrl`), `EventID`
(not `EventId`) — rather than the JSON response's `camelCase` field names verbatim, and not
getter methods the way the Java library exposes them, and not `snake_case` the way the Python
library exposes them. This is a deliberate naming-convention difference, not an inconsistency
across the four libraries: Java kept getter-method names close to the JSON field names, JS kept
`camelCase` readonly properties, Python uses `snake_case` attributes per PEP 8, and Go uses
capitalized initialisms per `golint`/the Go style guide. The underlying lookup response fields
are identical across all four libraries — only the surface spelling differs per ecosystem.

## Structure

```
go/
├── go.mod
├── README.md
└── eml/
    ├── error.go          — the library's entire public surface: EMLError, NewError, NewErrorWithLanguage
    ├── config.go          — lazy env var reads (APPNAME, EML_API, ENVIRONMENT)
    ├── lookup_client.go   — the net/http call + response validation
    ├── lookup_result.go   — internal struct for the lookup response (+ Resolved), and the
    │                        local-fallback builder
    └── eml_test.go        — real `go test` coverage: unit tests for parsing/fallback/validation
                              plus one integration test gated behind EML_INTEGRATION_TEST
```

Module path: `github.com/Bell-Cyberworks/error-message-library/libraries/go` (this repo's
actual GitHub org/name, per `git remote -v` — the correct Go module path convention for a
library living inside a larger, non-Go-module repo). Package name: `eml`, imported as
`eml.NewError(...)`.

## Status

Implemented. Zero dependencies beyond the Go standard library — only `net/http`,
`encoding/json`, `net/url`, `os`, `log`, and `time`, all requiring nothing beyond the Go 1.21+
toolchain itself (`go.mod` declares `go 1.21` as a floor; nothing here needs anything newer).

`net/http`'s plain `http.Client.Timeout` doesn't split connect vs. read phases the way Java's
`HttpClient` does (2s connect timeout, 3s request timeout); a single combined 3-second
`http.Client{Timeout: 3 * time.Second}` covering the whole request/response cycle is the same
idiomatic single-combined-timeout adaptation the JavaScript library already made (via
`AbortSignal.timeout`) and the Python library already made (via `urlopen(..., timeout=3)`), for
the same underlying reason — none of `fetch`, `urlopen`, or Go's `http.Client` expose separately
configurable connect/request timeouts the way Java's `HttpClient` does.

`lookup_client.go` unmarshals the response body into an untyped `map[string]interface{}` first
— deliberately **not** directly into a typed struct — because `encoding/json` fails the entire
`Unmarshal` call if a single JSON field's type doesn't match a typed struct field, which would
break the lenient per-field-default policy every other client library in this project
implements (missing/wrong-typed fields fall back to a safe default so future server-side field
additions or type changes don't break older client versions, except for `header` and
`friendlyMessage`, which are required and fail the lookup outright if absent or non-string —
same two required fields as the other three libraries). Each field is then extracted manually
with a type assertion plus a safe default (`stringOrDefault`, `intOrDefault`, `boolOrDefault`,
`nullableString`), mirroring Java's/JS's/Python's own per-field helper functions.

`encoding/json` decodes every JSON number into a Go `float64` when unmarshaling into
`interface{}`, so `httpCode` needs an explicit `float64` -> `int` conversion — the same kind of
adaptation Java makes for `Long`/`Double` and Python makes explicitly for `int`/`float`. Unlike
Python, Go's `map[string]interface{}` JSON decoding does **not** need a bool-vs-number guard:
`encoding/json` decodes a JSON boolean into a genuine Go `bool`, a distinct dynamic type from
`float64` at the `interface{}` level, so a type assertion to `float64` already excludes `bool`
values on its own — there is no Go analogue to Python's "`bool` is a subclass of `int`"
surprise, and this was verified (not assumed) while building `intOrDefault`/`boolOrDefault` in
`lookup_client.go`.

Nullable fields (`RedirectURL`, `EventID`, `EventCategory`) are represented as `*string` — Go's
idiomatic way to express a nullable string — rather than an empty-string-plus-presence-flag
convention; `nil` means "absent/not a string in the response," a non-`nil` pointer means
"present."

Resilience is the core design point: `NewError`/`NewErrorWithLanguage` never let a lookup
failure escape as a panic, and never return `nil`. Any expected failure — invalid/missing
configuration, a network error, a non-2xx HTTP status, or a response body missing the fields
this library needs — is handled internally, logged as a warning via the standard library's
`log` package, and replaced with a local fallback message (`Resolved == false`), kept
byte-for-byte in sync with the Java/JS/Python libraries' own fallback content (same header, same
friendly-message format, same HTTP code).

Go's `testing` package is standard-library with zero setup cost, unlike the other three
libraries (Java had no Maven/Gradle available; JS and Python used throwaway manual scripts by
choice), so this library is verified with a real `go test` suite rather than a manual script:

```
go test ./eml/...
go vet ./eml/...
```

covers response parsing, the local fallback content, the no-network-attempt validation failure,
and `*EMLError`'s `error`-interface conformance, all without requiring a live server.

One additional test, `TestLookupAgainstLiveServer`, is gated behind an `EML_INTEGRATION_TEST`
environment variable and calls `t.Skip` when it isn't set — this project has no live
`error-management-ui` instance running during a normal `go test` invocation, and a test that
fails by default whenever no server happens to be up would be a bad citizen in this codebase.
Run it explicitly, one scenario per invocation (a known-existing code, a brand-new/
never-before-seen code to exercise server-side auto-registration, an unreachable `EML_API` to
exercise the local fallback, an unregistered `APPNAME`/`ENVIRONMENT`, or a missing required env
var to exercise the no-network-attempt validation failure):

```
EML_INTEGRATION_TEST=1 APPNAME=my-app EML_API=http://localhost:3000 ENVIRONMENT=dev \
  EML_TEST_CODE=SOME_CODE go test ./eml/... -run TestLookupAgainstLiveServer -v
```
