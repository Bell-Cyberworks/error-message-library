# EML — JavaScript/TypeScript Library

Node.js client implementing the [shared library contract](../README.md) against the Error
Management UI's public lookup API. Ports the design of the [Java library](../java/README.md)
to idiomatic TypeScript/Node.js.

## Scope: Node.js only

This library targets **Node.js only** — it does not support browser apps, despite what an
earlier draft of this README said. The three-env-var config pattern (`APPNAME`, `EML_API`,
`ENVIRONMENT`, read via `process.env`) is fundamentally a server-side/Node concept: a browser
bundle can't read OS environment variables at runtime the way Node can. Bundlers can only
inline `process.env.*` values at *build* time, a completely different mechanism this library
doesn't attempt. Browser support would need a different config mechanism entirely and is a
separate, future concern — the same kind of deliberate scope-narrowing call made elsewhere in
this project (see `error-ui`'s README, and the Java library dropping its earlier "AOP"
design).

## Design: a resilient async factory, not a synchronous constructor

`EMLError extends Error`. In Java, `EMLError`'s constructor performs the EML lookup itself
(HTTP call, JSON parsing, fallback-on-failure) because `HttpClient.send()` can block
synchronously. JavaScript has no equivalent: Node's `fetch` always returns a `Promise`, so a
constructor alone can never resolve real data before the object exists.

The idiomatic TypeScript/Node equivalent is a **private constructor** plus a **static async
factory**, `EMLError.forCode(...)`:

```ts
// Configure via environment variables: APPNAME, EML_API, ENVIRONMENT
throw await EMLError.forCode("FIL1010");

// Or with an explicit language override (defaults to "en" otherwise, matching the server's
// own default):
throw await EMLError.forCode("FIL1010", "en-US");
```

`forCode` **never rejects** — it always resolves to a usable `EMLError` instance, matching
Java's "nothing but the library's own error type ever escapes" resilience guarantee as closely
as the language allows. If the lookup fails for any reason (missing configuration, network
failure, non-2xx response, an unparseable/unusable body), the resulting `EMLError` carries a
local fallback message instead, and `resolved` is `false` so callers can tell the difference
between a real, authored EML response and a fallback. A warning is logged (`console.warn`)
whenever a fallback occurs.

```ts
try {
  throw await EMLError.forCode("FIL1010");
} catch (e) {
  if (e instanceof EMLError) {
    e.header;          // "Error Handling Unavailable" if EML couldn't be reached
    e.friendlyMessage;
    e.httpCode;
    e.resolved;         // false if this is a local fallback, true if EML answered
    // ...and a readonly property for every other field on the lookup response.
  }
}
```

The constructor is `private` so callers can't accidentally construct an unresolved
`EMLError` directly with `new` — `forCode` is the only way to get an instance. This does not
affect `instanceof EMLError` checks: TypeScript's private-constructor restriction is
compile-time only (it blocks `new EMLError(...)` from outside the class), and `instanceof` is
a runtime prototype-chain check, so `catch (e) { if (e instanceof EMLError) ... }` works
exactly as expected on instances returned by `forCode`.

## Structure

```
javascript/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts         — public entry point; re-exports `EMLError` only
│   ├── EMLError.ts       — the library's entire public surface
│   ├── config.ts         — lazy env var reads (APPNAME, EML_API, ENVIRONMENT)
│   ├── lookupClient.ts   — the fetch call + response validation
│   └── lookupResult.ts   — internal type for the lookup response (+ `resolved`), and the
│                           local-fallback builder
└── test/
    └── manual-smoke-test.ts — plain script-based manual verification, run via `tsx`
```

## Status

Implemented. Zero runtime dependencies — only Node's built-in `fetch` (stable since Node 18,
with a 3-second request timeout via `AbortSignal.timeout`) and `JSON.parse`, both requiring
nothing beyond the Node runtime itself. `typescript` is a devDependency only (compile-time
type-checking and `.d.ts` generation via `npm run build`); it is not needed at runtime.

Node's built-in `fetch` has no separate connect-timeout the way Java's `HttpClient` does (which
uses a 2s connect timeout plus a 3s request timeout); a single combined 3-second request
timeout via `AbortSignal.timeout` is the idiomatic Node equivalent, covering the whole
request/response cycle.

Resilience is the core design point: `EMLError.forCode` never lets a lookup failure escape as
anything other than a resolved `EMLError`. Any expected failure — invalid/missing
configuration, a network error, a non-2xx HTTP status, or a response body missing the fields
this library needs (`header` and `friendlyMessage` are required; every other field falls back
to a safe per-field default so future server-side field additions don't break older client
versions) — is caught internally, logged as a warning via `console.warn`, and replaced with a
local fallback message (`resolved === false`).

Both `npm install` and real TypeScript compilation (`tsc`) work fine in this project's
environment (unlike the Java library's environment, which had no Maven/Gradle available), so
this library is verified two ways: `npm run build` (a real `tsc` compile) and a manual smoke
test run directly against a live `error-management-ui` instance:

```
APPNAME=my-app EML_API=http://localhost:3000 ENVIRONMENT=dev \
  npx tsx test/manual-smoke-test.ts SOME_CODE
```

`test/manual-smoke-test.ts` is intentionally run via `tsx` rather than compiled — it's a
throwaway verification script, not part of the published package, matching how this repo
already uses `tsx` for `error-management-ui/prisma/seed.ts`. Run it multiple times with
different codes (a known-existing code, a brand-new/never-before-seen code to exercise
server-side auto-registration, etc.) and different environment variable combinations (e.g.
omitting one to exercise the no-network-attempt validation failure, or pointing `EML_API` at
an unreachable host to exercise the local fallback) — one scenario per run.
