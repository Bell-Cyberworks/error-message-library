import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Role } from '@prisma/client';
import {
  DuplicateEnvironmentNameError,
  createEnvironment,
  getEnvironmentByName,
  listEnvironmentsForApplication,
  listNonProductionEnvironmentsForApplication,
} from '@/lib/services/environments';
import { createApplication } from '@/lib/services/applications';
import { prisma, uniqueSuffix } from '../testDb';

// Formalizes the environments.ts scenarios previously verified manually (Epic 5, plus the
// Environment-creation addition Epic 3 required — see this file's own docstring and
// CHANGELOG.md's 0.3.0 entry for why createEnvironment() exists at all).
describe('environments service', () => {
  let creatorUserId: string;
  const createdApplicationIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const creator = await prisma.user.create({
      data: {
        email: `env-creator-${suffix}@example.com`,
        name: 'Environments Test Creator',
        passwordHash: 'unused-in-tests',
        role: Role.ADMIN,
        isActive: true,
      },
    });
    creatorUserId = creator.id;
    createdUserIds.push(creator.id);
  });

  afterAll(async () => {
    if (createdApplicationIds.length > 0) {
      await prisma.application.deleteMany({ where: { id: { in: createdApplicationIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  async function createTestApplication() {
    const suffix = uniqueSuffix();
    const application = await createApplication({
      name: `Env Test App ${suffix}`,
      createdByUserId: creatorUserId,
    });
    createdApplicationIds.push(application.id);
    return application;
  }

  describe('createEnvironment', () => {
    it('always creates with isProduction: false, even though the function does not accept an isProduction param', async () => {
      const application = await createTestApplication();
      const suffix = uniqueSuffix();

      const environment = await createEnvironment({
        applicationId: application.id,
        name: `QA ${suffix}`,
      });

      expect(environment.isProduction).toBe(false);
    });

    it('throws DuplicateEnvironmentNameError for a case-insensitive duplicate name within the same Application', async () => {
      const application = await createTestApplication();
      const suffix = uniqueSuffix();
      const name = `QA ${suffix}`;

      await createEnvironment({ applicationId: application.id, name });

      await expect(
        createEnvironment({ applicationId: application.id, name: name.toUpperCase() }),
      ).rejects.toThrow(DuplicateEnvironmentNameError);
    });

    it('allows the same Environment name to be used by a different Application', async () => {
      const applicationA = await createTestApplication();
      const applicationB = await createTestApplication();
      const suffix = uniqueSuffix();
      const name = `QA ${suffix}`;

      const envA = await createEnvironment({ applicationId: applicationA.id, name });
      const envB = await createEnvironment({ applicationId: applicationB.id, name });

      expect(envA.name).toBe(name);
      expect(envB.name).toBe(name);
      expect(envA.applicationId).not.toBe(envB.applicationId);
    });
  });

  describe('listEnvironmentsForApplication / listNonProductionEnvironmentsForApplication', () => {
    it('listEnvironmentsForApplication orders production first, then name asc, and includes Prod', async () => {
      const application = await createTestApplication();
      const suffix = uniqueSuffix();

      await createEnvironment({ applicationId: application.id, name: `Zebra ${suffix}` });
      await createEnvironment({ applicationId: application.id, name: `Alpha ${suffix}` });

      const environments = await listEnvironmentsForApplication(application.id);

      expect(environments).toHaveLength(3); // auto-created Prod + Zebra + Alpha
      expect(environments[0]?.isProduction).toBe(true);
      expect(environments[0]?.name).toBe('Prod');
      expect(environments[1]?.name).toBe(`Alpha ${suffix}`);
      expect(environments[2]?.name).toBe(`Zebra ${suffix}`);
    });

    it('listNonProductionEnvironmentsForApplication excludes the Prod environment', async () => {
      const application = await createTestApplication();
      const suffix = uniqueSuffix();

      await createEnvironment({ applicationId: application.id, name: `Dev ${suffix}` });

      const nonProd = await listNonProductionEnvironmentsForApplication(application.id);

      expect(nonProd.every((env) => !env.isProduction)).toBe(true);
      expect(nonProd.some((env) => env.name === 'Prod')).toBe(false);
      expect(nonProd.some((env) => env.name === `Dev ${suffix}`)).toBe(true);
    });
  });

  describe('getEnvironmentByName', () => {
    it('returns an exact match', async () => {
      const application = await createTestApplication();

      const found = await getEnvironmentByName({ applicationId: application.id, name: 'Prod' });

      expect(found).not.toBeNull();
      expect(found?.applicationId).toBe(application.id);
    });

    it('returns null for a name that exists, but under a different applicationId (cross-tenant scoping)', async () => {
      const applicationA = await createTestApplication();
      const applicationB = await createTestApplication();
      const suffix = uniqueSuffix();
      const name = `OnlyInA ${suffix}`;

      await createEnvironment({ applicationId: applicationA.id, name });

      const found = await getEnvironmentByName({ applicationId: applicationB.id, name });

      expect(found).toBeNull();
    });
  });
});
