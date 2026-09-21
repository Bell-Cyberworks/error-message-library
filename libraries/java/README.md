# EML — Java Library

Java client implementing the [shared library contract](../README.md) against the Error
Management UI's public lookup API.

## Interception: a resilient exception constructor

There's no AOP/bytecode-weaving here. The interception mechanism is simpler and more
explicit: `EMLError` is a `RuntimeException` whose constructor itself performs the EML
lookup (HTTP call, JSON parsing, and — on any failure — automatic fallback and logging).
Throwing `new EMLError(code)` is the entire call site; nothing else is required.

## Usage

```java
// Configure once per app via environment variables: APPNAME, EML_API, ENVIRONMENT, EML_API_KEY
throw new EMLError("FIL1010");

// Or with an explicit language (defaults to "en" otherwise, matching the server's own default):
throw new EMLError("FIL1010", "en-US");
```

`EMLError` extends `RuntimeException` and always resolves to *something* usable, even when
EML is unreachable or misconfigured — it never throws a different exception out of its own
constructor. If the lookup fails for any reason (missing configuration, network failure,
non-2xx response, an unparseable body), the resulting `EMLError` carries a local fallback
message instead, and `isResolved()` returns `false` so callers can tell the difference
between a real, authored EML response and a fallback. A warning is logged
(`java.util.logging.Logger`) whenever a fallback occurs.

```java
try {
    throw new EMLError("FIL1010");
} catch (EMLError e) {
    e.getHeader();          // "Error Handling Unavailable" if EML couldn't be reached
    e.getFriendlyMessage();
    e.getHttpCode();
    e.isResolved();         // false if this is a local fallback, true if EML answered
    // ...and getters for every other field on the lookup response.
}
```

## Structure

```
java/
├── pom.xml
├── README.md
└── src/
    ├── main/java/com/bellcyberworks/eml/
    │   ├── EMLError.java              — the library's entire public surface
    │   ├── EMLConfig.java             — lazy env var reads (APPNAME, EML_API, ENVIRONMENT, EML_API_KEY)
    │   ├── EMLLookupClient.java       — HTTP call + response validation
    │   ├── LookupResult.java          — internal DTO for the lookup response (+ `resolved`)
    │   ├── EMLLookupFailedException.java — internal "fall back" signal
    │   └── json/MinimalJsonReader.java   — hand-written, dependency-free JSON reader
    └── test/java/com/bellcyberworks/eml/
        └── ManualSmokeTest.java       — plain `main()`-based manual verification
```

## Status

Implemented. Zero runtime/compile-scope dependencies — only `java.net.http.HttpClient`
(connect timeout 2s, request timeout 3s) and a small hand-written, single-pass JSON reader
(`MinimalJsonReader`), both requiring nothing beyond the JDK itself (Java 17 target,
`HttpClient` itself only needs Java 11).

Every request sends an `Authorization: Bearer <key>` header, populated from `EML_API_KEY`,
since the public lookup endpoint now requires authentication. A missing `EML_API_KEY` is
treated exactly like a missing `APPNAME`/`EML_API`/`ENVIRONMENT` — the required-configuration
check fails before any network attempt. A present-but-invalid key is likewise nothing
special: the server simply answers with a non-2xx (`401`) status, which this library already
treats as an ordinary lookup failure.

Resilience is the core design point: `EMLError`'s constructor never lets a lookup failure
escape as some other exception type. Any expected failure — invalid/missing configuration,
a network error, a non-2xx HTTP status (including a `401` from a missing or invalid API
key), or a response body missing the fields this library needs — is caught internally,
logged as a warning, and replaced with a local fallback message (`isResolved() == false`).
Only a genuine JVM `Error` (e.g. `OutOfMemoryError`) is left to propagate.

`mvn` and `gradle` were not available in the environment this library was built in, so it's
currently verified with a manual smoke test
(`src/test/java/com/bellcyberworks/eml/ManualSmokeTest.java`, a plain class with a
`public static void main`) compiled and run directly via `javac`/`java`, rather than
`mvn test`. The `pom.xml` is nonetheless a normal Maven project descriptor
(`maven.compiler.release` 17, JUnit 5 declared as a test-scope dependency for future use) —
`mvn test`/`mvn package` are expected to work normally once a build tool is available.
