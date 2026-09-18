import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Session } from 'next-auth';
import { Role } from '@prisma/client';
import {
  ForbiddenError,
  UnauthorizedError,
  requireApplicationAccess,
  requireRole,
} from '@/lib/auth/rbac';
import { assignApplicationAdmin, createApplication } from '@/lib/services/applications';
import { createApplicationAdminUser } from '@/lib/services/users';
import { prisma, uniqueSuffix } from '../testDb';

// Formalizes the requireRole()/requireApplicationAccess() scenarios previously verified
// manually. Fixtures reuse the applications/users service functions (already-correct real
// code) rather than hand-rolling raw Prisma inserts, per tests/README.md's convention.
describe('rbac', () => {
  let adminUserId: string;
  let applicationAdminUserId: string;
  let applicationId: string;
  let unassignedApplicationId: string;
  const createdApplicationIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const suffix = uniqueSuffix();

    const admin = await prisma.user.create({
      data: {
        email: `rbac-admin-${suffix}@example.com`,
        name: 'RBAC Admin',
        passwordHash: 'unused-in-tests',
        role: Role.ADMIN,
        isActive: true,
      },
    });
    adminUserId = admin.id;
    createdUserIds.push(admin.id);

    const appAdmin = await createApplicationAdminUser({
      email: `rbac-appadmin-${suffix}@example.com`,
      name: 'RBAC App Admin',
      password: 'Password123!',
    });
    applicationAdminUserId = appAdmin.id;
    createdUserIds.push(appAdmin.id);

    const application = await createApplication({
      name: `RBAC Test App ${suffix}`,
      createdByUserId: adminUserId,
    });
    applicationId = application.id;
    createdApplicationIds.push(application.id);

    const unassignedApplication = await createApplication({
      name: `RBAC Unassigned App ${suffix}`,
      createdByUserId: adminUserId,
    });
    unassignedApplicationId = unassignedApplication.id;
    createdApplicationIds.push(unassignedApplication.id);

    await assignApplicationAdmin({
      applicationId,
      userId: applicationAdminUserId,
      assignedByUserId: adminUserId,
    });
  });

  afterAll(async () => {
    if (createdApplicationIds.length > 0) {
      await prisma.application.deleteMany({ where: { id: { in: createdApplicationIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  describe('requireRole', () => {
    it('throws UnauthorizedError when there is no session', () => {
      expect(() => requireRole(null, Role.ADMIN)).toThrow(UnauthorizedError);
    });

    it('throws ForbiddenError when the session has the wrong role', () => {
      const session = {
        user: { id: applicationAdminUserId, role: Role.APPLICATION_ADMIN },
      } as unknown as Session;

      expect(() => requireRole(session, Role.ADMIN)).toThrow(ForbiddenError);
    });

    it('does not throw when the session has the correct role', () => {
      const session = { user: { id: adminUserId, role: Role.ADMIN } } as unknown as Session;

      expect(() => requireRole(session, Role.ADMIN)).not.toThrow();
    });
  });

  describe('requireApplicationAccess', () => {
    it('throws UnauthorizedError when there is no session', async () => {
      await expect(requireApplicationAccess(null, applicationId)).rejects.toThrow(UnauthorizedError);
    });

    it('does not throw for an ADMIN session, regardless of assignment', async () => {
      const session = { user: { id: adminUserId, role: Role.ADMIN } } as unknown as Session;

      await expect(requireApplicationAccess(session, unassignedApplicationId)).resolves.toBeUndefined();
    });

    it('does not throw for an APPLICATION_ADMIN session assigned to the Application', async () => {
      const session = {
        user: { id: applicationAdminUserId, role: Role.APPLICATION_ADMIN },
      } as unknown as Session;

      await expect(requireApplicationAccess(session, applicationId)).resolves.toBeUndefined();
    });

    it('throws ForbiddenError for an APPLICATION_ADMIN session not assigned to the Application', async () => {
      const session = {
        user: { id: applicationAdminUserId, role: Role.APPLICATION_ADMIN },
      } as unknown as Session;

      await expect(requireApplicationAccess(session, unassignedApplicationId)).rejects.toThrow(
        ForbiddenError,
      );
    });
  });
});
