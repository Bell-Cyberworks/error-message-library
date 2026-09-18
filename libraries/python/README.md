# EML — Python Library

Python client implementing the [shared library contract](../README.md) against the Error
Management UI's public lookup API. Ports the design of the [Java library](../java/README.md);
see also the [JavaScript/TypeScript library](../javascript/README.md) for how Node's async
`fetch` forced a different shape there.

## Design: a resilient exception constructor — Python's closest match to the original pattern

`EMLError` is an `Exception` whose constructor itself performs the EML lookup (HTTP call, JSON
parsing, and — on any failure — automatic fallback and logging). Throwing `raise
EMLError(code)` is the entire call site; nothing else is required.

This makes Python the closest of the three libraries built so far to the project's original
literal usage convention (`throw new EmlError(code)` in the initial sketch). Java could match
it because `HttpClient.send()` blocks synchronously inside a constructor. JavaScript could
**not** match it: Node's `fetch` always returns a `Promise`, so a constructor alone can never
resolve real data before the object exists, forcing a private constructor plus a static async
factory (`EMLError.forCode(...)`, awaited at the call site) instead. Python has no such
restriction — `urllib.request.urlopen(...)` is a normal, synchronous, blocking call, exactly
like Java's `HttpClient.send()` — so `EMLError.__init__` performs the lookup itself, and `raise
EMLError("FIL1010")` works as a genuine one-liner, no factory or `await` required. This is
worth stating plainly rather than glossing over: it's a direct, language-driven consequence of
Python allowing blocking I/O inside `__init__`, where JavaScript does not.

## Usage

```python
# Configure via environment variables: APPNAME, EML_API, ENVIRONMENT
raise EMLError("FIL1010")

# Or with an explicit language override (defaults to "en" otherwise, matching the server's own
# default):
raise EMLError("FIL1010", language="en-US")
```

`EMLError` always resolves to *something* usable, even when EML is unreachable or
misconfigured — nothing but a successfully-constructed `EMLError` ever escapes its own
`__init__`. If the lookup fails for any reason (missing configuration, network failure, non-2xx
response, an unparseable/unusable body), the resulting `EMLError` carries a local fallback
message instead, and `resolved` is `False` so callers can tell the difference between a real,
authored EML response and a fallback. A warning is logged (the standard library's `logging`
module) whenever a fallback occurs.

```python
try:
    raise EMLError("FIL1010")
except EMLError as e:
    e.header             # "Error Handling Unavailable" if EML couldn't be reached
    e.friendly_message
    e.http_code
    e.resolved            # False if this is a local fallback, True if EML answered
    # ...and a plain public attribute for every other field on the lookup response.
```

Every field is exposed as a plain public instance attribute using Python-idiomatic
`snake_case` names (`friendly_message`, `http_code`, `error_category`, `trans_id_display`,
etc.) — not the JSON response's `camelCase` field names verbatim, and not getter methods the
way the Java library exposes them. This is a deliberate naming-convention difference, not an
inconsistency across the three libraries: Java kept getter-method names close to the JSON
field names, JS kept `camelCase` readonly properties (both idiomatic for their ecosystems),
and Python uses `snake_case` attributes because that's what PEP 8 calls for. The underlying
lookup response fields are identical across all three libraries — only the surface spelling
differs.

## Structure

```
python/
├── pyproject.toml
├── README.md
├── .gitignore
├── src/
│   └── eml_client/
│       ├── __init__.py       — public entry point; exports `EMLError` only
│       ├── error.py          — the `EMLError` class
│       ├── config.py         — lazy env var reads (APPNAME, EML_API, ENVIRONMENT)
│       ├── lookup_client.py  — the `urllib.request` call + response validation
│       └── lookup_result.py  — internal dataclass for the lookup response (+ `resolved`), and
│                                the local-fallback builder
└── test/
    └── manual_smoke_test.py  — plain script-based manual verification, run via `python3`
```

Distribution name: `bellcyberworks-eml-client` (matching the Java `com.bellcyberworks.eml` /
JS `@bellcyberworks/eml-client` naming convention). Importable package name: `eml_client`
(Python package names can't contain dots or hyphens).

## Status

Implemented. Zero runtime dependencies — only `urllib.request` (a single combined 3-second
timeout via `urlopen(..., timeout=3)`, covering the whole connect+read cycle — the same
idiomatic single-combined-timeout adaptation the JavaScript library already made via
`AbortSignal.timeout`, for the same reason: neither `urlopen` nor `fetch` expose separately
configurable connect/request timeouts the way Java's `HttpClient` does) and the standard
library's `json` module for parsing — both requiring nothing beyond a Python 3.10+ interpreter.
No hand-written JSON parser is needed here the way Java's library needed one — `json` is
stdlib, same as JS's built-in `JSON.parse`.

Resilience is the core design point: `EMLError`'s constructor never lets a lookup failure
escape as some other exception type. Any expected failure — invalid/missing configuration, a
network error, a non-2xx HTTP status (raised by `urlopen` itself as `urllib.error.HTTPError`,
unlike Java/JS where the request completes and the status is checked afterward), or a response
body missing the fields this library needs (`header` and `friendlyMessage` are required; every
other field falls back to a safe per-field default so future server-side field additions don't
break older client versions) — is caught internally, logged as a warning, and replaced with a
local fallback message (`resolved == False`).

`EMLError.__init__` catches `Exception`, not `BaseException`. Java deliberately catches only
`RuntimeException | EMLLookupFailedException`, explicitly leaving real JVM `Error`s (e.g.
`OutOfMemoryError`) to propagate; JS makes the analogous narrow choice. Python's exception
hierarchy doesn't offer as clean a "definitely fatal, let it propagate" tier directly below
`Exception` for this purpose — there's no Python analogue to a JVM `Error` sitting alongside
"normal" exceptions. Catching `Exception` is nonetheless the correct Python-idiomatic
equivalent of Java's intent: `KeyboardInterrupt`, `SystemExit`, and `GeneratorExit` all inherit
directly from `BaseException`, **not** `Exception`, so catching only `Exception` still lets
them propagate normally, exactly as a JVM `Error` would in Java. Every other failure this
library can encounter is an expected, recoverable failure and is replaced with a local
fallback.

Both `pip3` and `uv` are available in this project's environment (unlike the Java library's
environment, which had no Maven/Gradle available), and `pyproject.toml` is a normal,
installable, `src`-layout project descriptor (`hatchling` build backend, no runtime
dependencies declared). `pip install -e .` or `uv pip install -e .`, run from
`libraries/python/`, are expected to work normally for real usage. No test-framework dependency
is declared — same reasoning as the other two libraries: verification here is a manual script
run directly against a real, running `error-management-ui` instance, not a mocked unit-test
suite, so `pytest` (or any other test runner) isn't a needed dependency.

```
APPNAME=my-app EML_API=http://localhost:3000 ENVIRONMENT=dev \
  python3 test/manual_smoke_test.py SOME_CODE
```

`test/manual_smoke_test.py` adjusts `sys.path` at the top so `src/eml_client` is importable
directly, without requiring `pip install -e .` to have been run first — it's a throwaway
verification script, not part of the published package. Run it multiple times with different
codes (a known-existing code, a brand-new/never-before-seen code to exercise server-side
auto-registration, etc.) and different environment variable combinations (e.g. omitting one to
exercise the no-network-attempt validation failure, or pointing `EML_API` at an unreachable
host to exercise the local fallback) — one scenario per run.
