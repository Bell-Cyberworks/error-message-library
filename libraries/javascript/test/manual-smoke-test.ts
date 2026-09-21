/**
 * Manual, test-runner-free smoke test for the EML JavaScript/TypeScript client.
 *
 * Mirrors the Java library's `ManualSmokeTest` in structure and intent — run directly against
 * a real, running `error-management-ui` instance, rather than mocked. Run it multiple times
 * with different `argv[2]` codes (a known-existing code, a brand-new/never-before-seen code
 * to exercise server-side auto-registration, etc.) and different environment variable
 * combinations (e.g. omitting one to exercise the no-network-attempt validation failure, or
 * pointing `EML_API` at an unreachable host to exercise the local fallback) — one scenario
 * per run, rather than scripting multiple scenarios into a single run.
 *
 * Run directly via `tsx` (no separate compile step needed for this file):
 *
 *   APPNAME=my-app EML_API=http://localhost:3000 ENVIRONMENT=dev EML_API_KEY=your-api-key \
 *     npx tsx test/manual-smoke-test.ts SOME_CODE
 */
import { EMLError } from '../src/EMLError.js';

const code = process.argv[2];
if (!code) {
  console.error('Usage: npx tsx test/manual-smoke-test.ts <errorCode>');
  process.exit(1);
}

console.log(
  `CONFIG APPNAME=${process.env.APPNAME} EML_API=${process.env.EML_API} ENVIRONMENT=${process.env.ENVIRONMENT} EML_API_KEY_SET=${!!process.env.EML_API_KEY}`,
);

const error = await EMLError.forCode(code);

console.log(
  'RESULT' +
    ` resolved=${error.resolved}` +
    ` code="${error.code}"` +
    ` appname="${error.appname}"` +
    ` environment="${error.environment}"` +
    ` language="${error.language}"` +
    ` header="${error.header}"` +
    ` description="${error.description}"` +
    ` friendlyMessage="${error.friendlyMessage}"` +
    ` category="${error.category}"` +
    ` errorCategory="${error.errorCategory}"` +
    ` httpCode=${error.httpCode}` +
    ` alertString="${error.alertString}"` +
    ` redirectUrl="${error.redirectUrl}"` +
    ` eventId="${error.eventId}"` +
    ` eventCategory="${error.eventCategory}"` +
    ` transIdDisplay=${error.transIdDisplay}` +
    ` retryEnabled=${error.retryEnabled}` +
    ` errorCodeDisplay=${error.errorCodeDisplay}` +
    ` needsAuthoring=${error.needsAuthoring}` +
    ` exceptionMessage="${error.message}"`,
);
