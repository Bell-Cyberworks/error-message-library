import { describe, expect, it } from 'vitest';
import { lookupErrorDetails } from '../src/lib/lookup';

// A real integration test against a live error-management-ui instance, but it must never fail
// a normal `npm test` run just because no live instance happens to be running — this project
// has none running during ordinary development. Mirrors the env-var-gated skip pattern already
// established in libraries/go/eml/eml_test.go's TestLookupAgainstLiveServer, and consistent
// with error-management-ui's own test suite's real-Postgres philosophy (no mocked backend for
// the thing actually being verified here).
//
// it.skipIf (Vitest's built-in conditional skip, stable since early Vitest releases and present
// in 5.0.1) is used instead of a manual `if` + early `return` inside the test body, so a
// skipped run still shows up clearly as "skipped" in test output rather than silently passing.
//
// Run it explicitly, once you know a specific Application/code/environment/language actually
// exists in whatever error-management-ui instance you're pointing at:
//
//   EML_INTEGRATION_TEST=1 MANAGEMENT_API_URL=http://localhost:3000 \
//     EML_TEST_APPNAME=my-app EML_TEST_CODE=SOME_CODE EML_TEST_ENVIRONMENT=dev \
//     EML_TEST_LANGUAGE=en npm test -- tests/lookup.integration.test.ts
describe('lookupErrorDetails against a live error-management-ui', () => {
  it.skipIf(!process.env.EML_INTEGRATION_TEST)(
    'resolves real content for a known application/code/environment/language',
    async () => {
      const appname = process.env.EML_TEST_APPNAME;
      const code = process.env.EML_TEST_CODE;
      const environment = process.env.EML_TEST_ENVIRONMENT;
      const language = process.env.EML_TEST_LANGUAGE || 'en';

      if (!appname || !code || !environment) {
        throw new Error(
          'EML_TEST_APPNAME, EML_TEST_CODE, and EML_TEST_ENVIRONMENT must all be set when ' +
            'EML_INTEGRATION_TEST=1 (EML_TEST_LANGUAGE defaults to "en" if unset). ' +
            'MANAGEMENT_API_URL must also be set, per the library under test.',
        );
      }

      const result = await lookupErrorDetails({ appname, code, environment, language });

      expect(result).not.toBeNull();
      expect(result?.code).toBe(code);
      expect(result?.appname).toBe(appname);
      expect(result?.environment).toBe(environment);
    },
  );
});
