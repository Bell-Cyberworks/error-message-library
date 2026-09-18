# Changelog

All notable changes to `error-ui` are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and version
numbers follow [Semantic Versioning](https://semver.org/).

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
