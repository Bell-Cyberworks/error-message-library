# Automated tests

## Running the suite

```bash
# Unit tests — no environment variables, no running services required.
npm test

# Watch mode.
npm run test:watch
```

## What's covered

- `tests/lookup.test.ts` — every exported function in `src/lib/lookup.ts`
  (`normalizeParams`, `firstValue`, `lookupErrorDetails`, and the `FALLBACK_HEADER`/
  `FALLBACK_MESSAGE` constants), with `fetch` mocked via Vitest's built-in `vi.stubGlobal`
  (no separate mocking library) and `MANAGEMENT_API_URL`/`EML_SYSTEM_API_KEY` set/unset
  directly on `process.env` in `beforeEach`/`afterEach`, restored to their original values
  after every test so no test leaks env state into another.
  - Missing-param short-circuits (`appname`/`code`/`environment`/`language`, each tested
    individually) and the missing-`MANAGEMENT_API_URL`/missing-`EML_SYSTEM_API_KEY`
    short-circuits — all confirmed to return `null` **without** ever calling `fetch`.
  - The missing-`MANAGEMENT_API_URL`, missing-`EML_SYSTEM_API_KEY`, and thrown-`fetch` failure
    paths all assert `console.error` was called, matching current behavior.
  - The request built for a successful call: correct `/api/v1/lookup` URL with
    `application`/`code`/`environment` query params (including a value containing a space, to
    confirm proper encoding), the `Accept-Language` header set from `language`, the
    `Authorization: Bearer <key>` header set from `EML_SYSTEM_API_KEY`, and `cache: 'no-store'`.
  - A `200` response returns the parsed JSON body; a non-2xx response returns `null` **without**
    calling `.json()` on the response — the current code's `if (!response.ok) return null;`
    short-circuits before the body is ever read, and the test asserts the mocked `.json` method
    was not invoked.
  - A thrown/rejected `fetch` (network failure) returns `null`.
- `tests/lookup.integration.test.ts` — one real integration test against a live, running
  `error-management-ui` instance. Gated behind `EML_INTEGRATION_TEST` the same way
  `libraries/go/eml/eml_test.go`'s `TestLookupAgainstLiveServer` is gated, using Vitest's
  `it.skipIf` so a normal `npm test` run shows it as explicitly **skipped**, not silently
  passing. Run it explicitly, once you know a specific Application/code/environment/language
  actually exists in whatever instance you're pointing at:

  ```bash
  EML_INTEGRATION_TEST=1 MANAGEMENT_API_URL=http://localhost:3000 \
    EML_SYSTEM_API_KEY=<a-real-system-api-key> \
    EML_TEST_APPNAME=my-app EML_TEST_CODE=SOME_CODE EML_TEST_ENVIRONMENT=dev \
    EML_TEST_LANGUAGE=en npm test -- tests/lookup.integration.test.ts
  ```

  `EML_TEST_LANGUAGE` defaults to `en` if unset. `MANAGEMENT_API_URL` and `EML_SYSTEM_API_KEY`
  are read the exact same way `src/lib/lookup.ts` already reads them in production — no separate
  test config layer. `EML_SYSTEM_API_KEY` must be a system-level key (created from
  `error-management-ui`'s `/system-api-keys` admin page), not a per-Application key.

## What's explicitly out of scope

**Full page rendering / component tests.** `src/app/page.tsx` is a Next.js async Server
Component; this project has no browser automation tool (no Playwright, no equivalent)
available in this environment, and React Testing Library's async-Server-Component support
isn't solid enough to rely on for CI-grade coverage. Rather than build brittle or misleading
coverage around that gap, the app's actual logic (query-param normalization and the
management-API lookup, including every branch that decides between rendering real content and
the fallback card) was extracted into `src/lib/lookup.ts` specifically so it could be tested
directly, in Node, without rendering anything. `page.tsx` itself is now a thin wrapper: it
calls the extracted functions and returns JSX built directly from their results, with no
independent branching logic of its own left to test. This is a deliberate, stated scope
boundary, not an oversight — the same posture `error-management-ui`'s test suite takes with
Server Actions (see `error-management-ui/tests/README.md`).
