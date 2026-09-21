# Changelog

All notable changes to `error-ui` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version
numbers follow [Semantic Versioning](https://semver.org/).

## [0.3.0] - 2026-09-18

### Changed

- **Breaking:** `lookupErrorDetails` (`src/lib/lookup.ts`) now sends an
  `Authorization: Bearer <key>` header on every call to `error-management-ui`'s
  `GET /api/v1/lookup`, matching that endpoint's new API key requirement (see
  `error-management-ui`'s `0.6.0` changelog entry). The key is read from a new required
  environment variable, `EML_SYSTEM_API_KEY`, which must be a **system-level** key (created from
  `error-management-ui`'s `/system-api-keys` admin page, Admin-only) rather than a
  per-Application key, since Error UI resolves whichever Application a caller sends it via the
  `appname` query param and can't hold one Application's key ahead of time. If
  `EML_SYSTEM_API_KEY` is unset, `lookupErrorDetails` logs an error and returns `null` (same
  short-circuit shape as the existing missing-`MANAGEMENT_API_URL` check) without attempting a
  request. Deployments upgrading to this version must provision a system API key and set
  `EML_SYSTEM_API_KEY` before error lookups will succeed — see `README.md` and
  root `docker-compose.yml`'s `error-ui` service block, which now requires it via the same
  `${VAR:?message}` pattern used for `error-management-ui`'s `AUTH_SECRET`.

## [0.2.0] - 2026-09-18

### Added

- First automated test suite for this project (`tests/`, Vitest `5.0.1`, matching
  `error-management-ui`'s test suite version for consistency). New `npm test` / `npm run
  test:watch` scripts.
  - `tests/lookup.test.ts` — unit tests for `src/lib/lookup.ts`'s `normalizeParams`,
    `firstValue`, and `lookupErrorDetails`, with `fetch` mocked via Vitest's built-in
    `vi.stubGlobal` (no separate mocking library) and `MANAGEMENT_API_URL` set/unset directly
    on `process.env` per test. Covers every missing-param and missing-env-var short-circuit
    (each asserted to skip the network call entirely), the exact request URL/headers/init
    built for a successful call, the 200-parses-body and non-2xx-short-circuits-before-reading-
    the-body paths, and the thrown-`fetch` failure path — including the two `console.error`
    call sites.
  - `tests/lookup.integration.test.ts` — one opt-in integration test against a real, running
    `error-management-ui` instance, gated behind `EML_INTEGRATION_TEST` via Vitest's
    `it.skipIf`, mirroring `libraries/go/eml/eml_test.go`'s `TestLookupAgainstLiveServer`
    pattern. Skipped by default; see `tests/README.md` for the exact invocation.
  - `README.md`'s Status section documents the new suite, the run commands, and the explicit
    scope boundary (pure-logic coverage only — no full page-rendering/component tests, since no
    browser automation tool is available in this environment).

### Changed

- **Refactor, no behavior change:** extracted `LookupResponse`, `ErrorPageParams`,
  `RawSearchParams`, `FALLBACK_HEADER`, `FALLBACK_MESSAGE`, `normalizeParams`, `firstValue`,
  and `lookupErrorDetails` out of `src/app/page.tsx` into a new `src/lib/lookup.ts`, so this
  logic is independently testable without rendering the async Server Component. `page.tsx` is
  now a thin wrapper: it imports everything from `@/lib/lookup` and keeps only `Home`'s JSX and
  the `Metadata` export. Logic and output are unchanged.

## [0.1.0] - Initial direct-lookup, full-page display implementation.
