# Error UI

An embeddable UI layer that renders a managed error message to the end user, consistently across every app that adopts it.

See [Error Code Schema](../docs/error-code-schema.md) for the JSON shape this renders.

## Integration modes

- **Direct lookup**: given `APPNAME + CODE + LANGUAGE`, calls the [Error Management UI](../error-management-ui/README.md) backend's public API itself and renders the result.
- **Pre-resolved payload**: the host app already resolved the error via its [library](../libraries/README.md) and hands Error UI the resulting JSON directly — no second API call.

## Display modes

Selected by the error's `ALERT_STRING`/display-mode field:
- **Full error page** — for hard failures / navigation-blocking errors.
- **Inline / toast** — for non-blocking errors surfaced in place.

When `REDIRECT_URL` is set on the error, Error UI honors it (e.g. offering or performing a redirect) regardless of display mode.

## Planned Structure

```
error-ui/
├── src/
│   ├── app/
│   │   ├── layout.tsx    # Root layout, page metadata
│   │   ├── globals.css   # Centered-card styling for the error display
│   │   └── page.tsx      # Server Component: thin wrapper around src/lib/lookup.ts
│   └── lib/
│       └── lookup.ts     # Pure logic: param normalization + the management-API lookup call
├── tests/
│   ├── lookup.test.ts             # Unit tests for src/lib/lookup.ts (mocked fetch)
│   ├── lookup.integration.test.ts # Gated integration test against a live error-management-ui
│   └── README.md
├── public/
├── Dockerfile            # Multi-stage container image (Next.js standalone output)
├── next.config.ts
├── eslint.config.mjs
├── vitest.config.mts
├── tsconfig.json
└── package.json
```

Runs as one of the services in the root [docker-compose.yml](../docker-compose.yml).

## Status

**Implemented:** direct-lookup, full-page display only. The page reads `appname`, `code`,
`environment`, and `language` from the URL's query params, calls Error Management UI's public
`GET /api/v1/lookup` API server-side (passing `language` via the `Accept-Language` header, per
[the schema doc](../docs/error-code-schema.md)), and renders a centered card with the `header`,
`code`, and `friendlyMessage` fields. Any missing param, network failure, or non-2xx response
renders a generic fallback card instead of crashing.

**Required environment variables:**
- `MANAGEMENT_API_URL` — base URL of the `error-management-ui` instance to call.
- `EML_SYSTEM_API_KEY` — a **system-level** API key, sent as `Authorization: Bearer <key>` on
  every lookup request, since `GET /api/v1/lookup` now requires authentication. This must be a
  system-level key, not a per-Application key — Error UI resolves whichever Application a caller
  sends it via the `appname` query param, so it can't hold one Application's key ahead of time.
  Create one from `error-management-ui`'s `/system-api-keys` admin page (Admin only); see
  [error-management-ui's README](../error-management-ui/README.md#api-key-authentication) for
  details. If either variable is unset, `lookupErrorDetails` logs an error and returns `null`
  (rendering the generic fallback card) without attempting a request.

**Test suite (new):** the param-normalization and lookup logic that used to live inline in
`src/app/page.tsx` has been extracted into `src/lib/lookup.ts` (`normalizeParams`, `firstValue`,
`lookupErrorDetails`, the `LookupResponse`/`ErrorPageParams`/`RawSearchParams` types, and the
`FALLBACK_HEADER`/`FALLBACK_MESSAGE` constants) specifically so it can be unit-tested directly,
without rendering anything. `page.tsx` is now a thin wrapper around that module — same
behavior, same JSX, no logic changes.

- `npm test` runs the unit test suite (Vitest `5.0.1`, matching `error-management-ui`'s test
  suite for consistency) — no environment variables or running services required, only
  `npm install` first. `npm run test:watch` runs it in watch mode.
- A second, opt-in integration test (`tests/lookup.integration.test.ts`) exercises
  `lookupErrorDetails` against a real, running `error-management-ui` instance. It's skipped by
  default and only runs when explicitly invoked with `EML_INTEGRATION_TEST=1` plus a real
  `MANAGEMENT_API_URL`, a real system-level `EML_SYSTEM_API_KEY`, and
  `EML_TEST_APPNAME`/`EML_TEST_CODE`/`EML_TEST_ENVIRONMENT`/`EML_TEST_LANGUAGE` (defaults to
  `en`) pointing at data that actually exists in that instance. See `tests/README.md` for the
  exact invocation.
- **Explicitly out of scope:** full page-rendering/component tests. `page.tsx` is an async
  Server Component; no browser automation tool (e.g. Playwright) is available in this
  environment, and React Testing Library's async-Server-Component support isn't solid enough
  to rely on. Coverage here is pure-logic only, via the `src/lib/lookup.ts` extraction — see
  `tests/README.md` for the full rationale, the same scope-boundary approach
  `error-management-ui`'s test suite takes with Server Actions.

**Not yet implemented** — these remain the documented eventual design (see "Integration modes"
and "Display modes" above), just not built in this pass:
- Pre-resolved payload integration mode (host app hands Error UI the JSON directly, skipping
  the API call).
- Inline/toast display mode selected by `alertString` — this pass only renders the full error
  page.
- `REDIRECT_URL` handling.
