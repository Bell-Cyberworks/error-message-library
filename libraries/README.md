# Libraries

One client SDK per programming language, each implementing the same contract against the [Error Management UI](../error-management-ui/README.md) backend API, per the [Error Code Schema](../docs/error-code-schema.md).

## Shared contract

- **Application code never writes error text** — it only throws/raises an error `CODE`. Each library intercepts that as idiomatically as possible for its ecosystem, so nothing beyond the throw/raise is required at the call site — no explicit "now call the SDK" step.
- Whatever mechanism does the interception is also responsible for **logging the error automatically**.
- Each library instance is configured once per app with `APPNAME` (plus API base URL/credentials — TBD).
- On throw: the interception calls the Management UI's public API with `APPNAME + CODE + LANGUAGE + ENVIRONMENT`, plus an API key sent via the `Authorization: Bearer <key>` header, and gets back the error JSON. Unknown codes are auto-registered server-side with placeholder text — the library never hard-fails just because a code is new. Each library reads its key from a new `EML_API_KEY` environment variable, issued per-Application from that Application's API Keys page in the Error Management UI. A missing/invalid/wrong-scope key returns `401`.
- The resulting JSON is dual-purpose: it can be handed to [Error UI](../error-ui/README.md) for rendering, or — for service-to-service calls with no UI involved — returned as-is as the API's own error response body.

Each language is free to choose its own idiomatic interception mechanism — see the Java library below for a concrete example (a resilient exception constructor that performs the lookup itself).

## Languages

| Language | Status |
|---|---|
| [JavaScript/TypeScript](javascript/README.md) | Implemented |
| [Python](python/README.md) | Implemented |
| [Go](go/README.md) | Implemented |
| [Java](java/README.md) | Implemented |

More languages can be added following the same contract and directory layout.
