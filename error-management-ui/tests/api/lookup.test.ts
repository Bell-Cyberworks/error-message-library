import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { Role } from '@prisma/client';
import type { Environment } from '@prisma/client';
import { GET } from '@/app/api/v1/lookup/route';
import { createApplication } from '@/lib/services/applications';
import { createEnvironment } from '@/lib/services/environments';
import { createErrorCode, updateErrorContent } from '@/lib/services/errorCodes';
import { createApplicationApiKey, createSystemApiKey } from '@/lib/services/apiKeys';
import { prisma, uniqueSuffix } from '../testDb';

// Formalizes the /api/v1/lookup scenarios previously verified manually: this is the public
// endpoint Libraries and Error UI call directly, invoked here the same way — a real
// NextRequest, not an HTTP round-trip — against a real Postgres instance. Every successful
// (200) request now requires a valid Authorization header (application-scoped or system-level
// API key) — see src/lib/services/apiKeys.ts's verifyApiKeyForApplication().
describe('GET /api/v1/lookup', () => {
  let creatorUserId: string;
  let applicationName: string;
  let applicationId: string;
  let nonProdEnvironment: Environment;
  let applicationApiKey: string;
  let systemApiKey: string;
  let otherApplicationApiKey: string;
  const createdApplicationIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdSystemApiKeyIds: string[] = [];

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const creator = await prisma.user.create({
      data: {
        email: `lookup-creator-${suffix}@example.com`,
        name: 'Lookup Test Creator',
        passwordHash: 'unused-in-tests',
        role: Role.ADMIN,
        isActive: true,
      },
    });
    creatorUserId = creator.id;
    createdUserIds.push(creator.id);

    applicationName = `Lookup Test App ${suffix}`;
    const application = await createApplication({
      name: applicationName,
      createdByUserId: creatorUserId,
    });
    applicationId = application.id;
    createdApplicationIds.push(application.id);

    nonProdEnvironment = await createEnvironment({ applicationId, name: `NonProd ${suffix}` });

    const { rawKey: appKey } = await createApplicationApiKey({
      applicationId,
      name: `Test key ${suffix}`,
      createdByUserId: creatorUserId,
    });
    applicationApiKey = appKey;

    const { record: sysKeyRecord, rawKey: sysKey } = await createSystemApiKey({
      name: `Test system key ${suffix}`,
      createdByUserId: creatorUserId,
    });
    systemApiKey = sysKey;
    createdSystemApiKeyIds.push(sysKeyRecord.id);

    // A second Application's key, to prove an app-scoped key is rejected against a *different*
    // Application's codes — not just "any app key works everywhere".
    const otherApplication = await createApplication({
      name: `Other Lookup Test App ${suffix}`,
      createdByUserId: creatorUserId,
    });
    createdApplicationIds.push(otherApplication.id);
    const { rawKey: otherKey } = await createApplicationApiKey({
      applicationId: otherApplication.id,
      name: `Other app's key ${suffix}`,
      createdByUserId: creatorUserId,
    });
    otherApplicationApiKey = otherKey;
  });

  afterAll(async () => {
    if (createdSystemApiKeyIds.length > 0) {
      await prisma.systemApiKey.deleteMany({ where: { id: { in: createdSystemApiKeyIds } } });
    }
    if (createdApplicationIds.length > 0) {
      await prisma.application.deleteMany({ where: { id: { in: createdApplicationIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  function buildRequest(
    params: Record<string, string | undefined>,
    options: { apiKey?: string | null } = {},
  ) {
    const url = new URL('http://localhost/api/v1/lookup');
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) {
        url.searchParams.set(key, value);
      }
    }
    const headers: Record<string, string> = { 'accept-language': 'en' };
    // Defaults to a valid application-scoped key so every existing scenario (written before
    // auth existed) keeps testing what it was written to test, unless a test explicitly passes
    // `apiKey: null` (omit entirely) or a different key to exercise the auth boundary itself.
    const apiKey = options.apiKey === undefined ? applicationApiKey : options.apiKey;
    if (apiKey) {
      headers.authorization = `Bearer ${apiKey}`;
    }
    return new NextRequest(url, { headers });
  }

  it('returns 200 with the exact authored content for a known, already-authored code', async () => {
    const suffix = uniqueSuffix();
    const code = `KNOWN-${suffix}`;
    const errorMessage = await createErrorCode({
      applicationId,
      environmentId: nonProdEnvironment.id,
      code,
      language: 'en',
    });

    const content = await prisma.errorContent.findFirstOrThrow({
      where: { errorMessageId: errorMessage.id },
    });
    await updateErrorContent({
      errorContentId: content.id,
      header: 'Authored header',
      description: 'Authored description',
      friendlyMessage: 'Authored friendly message',
      category: 'General',
      errorCategory: 'Unclassified',
      httpCode: 400,
      alertString: 'toast',
      redirectUrl: null,
      eventId: null,
      eventCategory: null,
      transIdDisplay: false,
      retryEnabled: false,
      errorCodeDisplay: false,
    });

    const response = await GET(
      buildRequest({ application: applicationName, code, environment: nonProdEnvironment.name }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.header).toBe('Authored header');
    expect(body.description).toBe('Authored description');
    expect(body.needsAuthoring).toBe(false);
    expect(body.code).toBe(code);
    expect(body.appname).toBe(applicationName);
    expect(body.environment).toBe(nonProdEnvironment.name);
    expect(body.language).toBe('en');
  });

  it('returns 200, auto-registers, and needsAuthoring: true for an unknown code', async () => {
    const suffix = uniqueSuffix();
    const code = `UNKNOWN-${suffix}`;

    const response = await GET(
      buildRequest({ application: applicationName, code, environment: nonProdEnvironment.name }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.needsAuthoring).toBe(true);
    expect(body.header).toBe('Something Went Wrong');
    expect(body.code).toBe(code);
  });

  it('is idempotent for repeated lookups of the same unknown code: same content both times, only one ErrorMessage row exists', async () => {
    const suffix = uniqueSuffix();
    const code = `IDEMPOTENT-${suffix}`;

    const firstResponse = await GET(
      buildRequest({ application: applicationName, code, environment: nonProdEnvironment.name }),
    );
    const secondResponse = await GET(
      buildRequest({ application: applicationName, code, environment: nonProdEnvironment.name }),
    );

    const firstBody = await firstResponse.json();
    const secondBody = await secondResponse.json();

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstBody.code).toBe(secondBody.code);
    expect(firstBody.header).toBe(secondBody.header);
    expect(firstBody.needsAuthoring).toBe(secondBody.needsAuthoring);

    const messages = await prisma.errorMessage.findMany({
      where: { applicationId, code: { equals: code, mode: 'insensitive' } },
    });
    expect(messages).toHaveLength(1);
  });

  it('returns 404 with an application-specific error message for an unregistered application', async () => {
    const response = await GET(
      buildRequest({ application: 'Nonexistent App XYZ', code: 'ANY', environment: 'Prod' }),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toContain('Nonexistent App XYZ');
  });

  it('returns 404 with an environment-specific error message for a registered application but unregistered environment', async () => {
    const response = await GET(
      buildRequest({ application: applicationName, code: 'ANY', environment: 'NoSuchEnvironment' }),
    );

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toContain('NoSuchEnvironment');
    expect(body.error).toContain(applicationName);
  });

  it('returns 400 when any of application/code/environment is missing', async () => {
    const missingApplication = await GET(buildRequest({ code: 'ANY', environment: 'Prod' }));
    expect(missingApplication.status).toBe(400);

    const missingCode = await GET(buildRequest({ application: applicationName, environment: 'Prod' }));
    expect(missingCode.status).toBe(400);

    const missingEnvironment = await GET(buildRequest({ application: applicationName, code: 'ANY' }));
    expect(missingEnvironment.status).toBe(400);
  });

  describe('authorization', () => {
    it('returns 401 when no Authorization header is present', async () => {
      const response = await GET(
        buildRequest(
          { application: applicationName, code: 'ANY', environment: nonProdEnvironment.name },
          { apiKey: null },
        ),
      );

      expect(response.status).toBe(401);
      const body = await response.json();
      expect(body.error).toMatch(/authorization/i);
    });

    it('returns 401 for a syntactically invalid key', async () => {
      const response = await GET(
        buildRequest(
          { application: applicationName, code: 'ANY', environment: nonProdEnvironment.name },
          { apiKey: 'not-a-real-key' },
        ),
      );

      expect(response.status).toBe(401);
    });

    it('returns 401 for a well-formed but nonexistent key', async () => {
      const response = await GET(
        buildRequest(
          { application: applicationName, code: 'ANY', environment: nonProdEnvironment.name },
          { apiKey: 'eml_app_0000000000000000000000000000000000000000000000' },
        ),
      );

      expect(response.status).toBe(401);
    });

    it("returns 401 for a valid key scoped to a *different* Application — the same generic message as any other auth failure, so a caller can't distinguish 'wrong app' from 'no key'", async () => {
      const unauthorizedResponse = await GET(
        buildRequest(
          { application: applicationName, code: 'ANY', environment: nonProdEnvironment.name },
          { apiKey: null },
        ),
      );
      const wrongAppResponse = await GET(
        buildRequest(
          { application: applicationName, code: 'ANY', environment: nonProdEnvironment.name },
          { apiKey: otherApplicationApiKey },
        ),
      );

      expect(wrongAppResponse.status).toBe(401);
      const unauthorizedBody = await unauthorizedResponse.json();
      const wrongAppBody = await wrongAppResponse.json();
      expect(wrongAppBody.error).toBe(unauthorizedBody.error);
    });

    it('accepts a valid application-scoped key (the default used by every test above)', async () => {
      const response = await GET(
        buildRequest({ application: applicationName, code: 'ANY', environment: nonProdEnvironment.name }),
      );

      expect(response.status).toBe(200);
    });

    it('accepts a valid system-level key for a lookup against any Application', async () => {
      const response = await GET(
        buildRequest(
          { application: applicationName, code: 'ANY', environment: nonProdEnvironment.name },
          { apiKey: systemApiKey },
        ),
      );

      expect(response.status).toBe(200);
    });

    it('updates lastUsedAt on the matched key after a successful lookup', async () => {
      // A dedicated, not-yet-used key — applicationApiKey (the default used by every other
      // test in this file) has already been used many times by the time this test runs, so
      // reusing it here couldn't assert on the "starts null" half of this behavior.
      const suffix = uniqueSuffix();
      const { record, rawKey } = await createApplicationApiKey({
        applicationId,
        name: `lastUsedAt test key ${suffix}`,
        createdByUserId: creatorUserId,
      });
      expect(record.lastUsedAt).toBeNull();

      await GET(
        buildRequest(
          { application: applicationName, code: 'ANY', environment: nonProdEnvironment.name },
          { apiKey: rawKey },
        ),
      );

      const after = await prisma.applicationApiKey.findUniqueOrThrow({ where: { id: record.id } });
      expect(after.lastUsedAt).not.toBeNull();
    });
  });
});
