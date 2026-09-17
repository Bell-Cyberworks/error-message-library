# Libraries

One client SDK per programming language, each implementing the same contract against the [Error Management UI](../error-management-ui/README.md) backend API, per the [Error Code Schema](../docs/error-code-schema.md).

## Shared contract

- **Application code never writes error text** — it only throws/raises an error `CODE`. Each library intercepts that as idiomatically as possible for its ecosystem, so nothing beyond the throw/raise is required at the call site — no explicit "now call the SDK" step.
- Whatever mechanism does the interception is also responsible for **logging the error automatically**.
- Each library instance is configured once per app with `APPNAME` (plus API base URL/credentials — TBD).
- On throw: the interception calls the Management UI's public API with `APPNAME + CODE + LANGUAGE` and gets back the error JSON. Unknown codes are auto-registered server-side with placeholder text — the library never hard-fails just because a code is new.
- The resulting JSON is dual-purpose: it can be handed to [Error UI](../error-ui/README.md) for rendering, or — for service-to-service calls with no UI involved — returned as-is as the API's own error response body.

Each language is free to choose its own idiomatic interception mechanism — see the Java library below for a concrete example (AOP).

## Languages

| Language | Status |
|---|---|
| [JavaScript/TypeScript](javascript/README.md) | Structure only |
| [Python](python/README.md) | Structure only |
| [Go](go/README.md) | Structure only |
| [Java](java/README.md) | Structure only |

More languages can be added following the same contract and directory layout.
