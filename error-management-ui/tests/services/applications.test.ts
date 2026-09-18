import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Session } from 'next-auth';
import { Role } from '@prisma/client';
import {
  AssignmentNotFoundError,
  ApplicationAdminAlreadyAssignedError,
  DuplicateApplicationError,
  InvalidAssignmentTargetError,
  assignApplicationAdmin,
  createApplication,
  getApplicationById,
  listApplicationsForUser,
  removeApplicationAdmin,
} from '@/lib/services/applications';
import { createApplicationAdminUser } from '@/lib/services/users';
import { UnauthorizedError } from '@/lib/auth/rbac';
import { prisma, uniqueSuffix } from '../testDb';

// Formalizes the applications.ts scenarios that were previously verified with manual
// throwaway scripts against a real Postgres instance (US-2.1/US-2.3/US-2.4).
describe('applications service', () => {
  let creatorUserId: string;
  const createdApplicationIds: string[] = [];
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    const suffix = uniqueSuffix();
    const creator = await prisma.user.create({
      data: {
        email: `apps-creator-${suffix}@example.com`,
        name: 'Applications Test Creator',
        passwordHash: 'unused-in-tests',
        role: Role.ADMIN,
        isActive: true,
      },
    });
    creatorUserId = creator.id;
    createdUserIds.push(creator.id);
  });

  afterAll(async () => {
    // Application cascade-deletes its Environments/ErrorMessages/ErrorContents/
    // ApplicationAdminAssignments (onDelete: Cascade in schema.prisma), so deleting the
    // top-level Application rows is sufficient cleanup for everything created under them.
    if (createdApplicationIds.length > 0) {
      await prisma.application.deleteMany({ where: { id: { in: createdApplicationIds } } });
    }
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  async function createTestApplication(namePrefix = 'Test App') {
    const suffix = uniqueSuffix();
    const application = await createApplication({
      name: `${namePrefix} ${suffix}`,
      createdByUserId: creatorUserId,
    });
    createdApplicationIds.push(application.id);
    return application;
  }

  describe('createApplication', () => {
    it('creates the Application row and auto-creates its Prod Environment in the same transaction', async () => {
      const application = await createTestApplication();

      const environments = await prisma.environment.findMany({
        where: { applicationId: application.id },
      });

      expect(environments).toHaveLength(1);
      expect(environments[0]?.name).toBe('Prod');
      expect(environments[0]?.isProduction).toBe(true);
    });

    it('throws DuplicateApplicationError for an exact-duplicate name', async () => {
      const suffix = uniqueSuffix();
      const name = `Test App ${suffix}`;
      const application = await createApplication({ name, createdByUserId: creatorUserId });
      createdApplicationIds.push(application.id);

      await expect(
        createApplication({ name, createdByUserId: creatorUserId }),
      ).rejects.toThrow(DuplicateApplicationError);
    });

    it('throws DuplicateApplicationError for a case-different duplicate name', async () => {
      const suffix = uniqueSuffix();
      const name = `Test App ${suffix}`;
      const application = await createApplication({ name, createdByUserId: creatorUserId });
      createdApplicationIds.push(application.id);

      await expect(
        createApplication({ name: name.toLowerCase(), createdByUserId: creatorUserId }),
      ).rejects.toThrow(DuplicateApplicationError);
    });
  });

  describe('listApplicationsForUser', () => {
    it('throws UnauthorizedError when there is no session', async () => {
      await expect(listApplicationsForUser(null)).rejects.toThrow(UnauthorizedError);
    });

    it('ADMIN sees every Application including ones it did not create; an unassigned APPLICATION_ADMIN sees none; after assignment it sees exactly the assigned one', async () => {
      const suffix = uniqueSuffix();
      const application = await createTestApplication();

      const otherAdmin = await prisma.user.create({
        data: {
          email: `apps-other-admin-${suffix}@example.com`,
          name: 'Other Admin',
          passwordHash: 'unused-in-tests',
          role: Role.ADMIN,
          isActive: true,
        },
      });
      createdUserIds.push(otherAdmin.id);

      const adminSession = { user: { id: otherAdmin.id, role: Role.ADMIN } } as unknown as Session;
      const adminApps = await listApplicationsForUser(adminSession);
      expect(adminApps.some((app) => app.id === application.id)).toBe(true);

      const appAdminUser = await createApplicationAdminUser({
        email: `apps-appadmin-${suffix}@example.com`,
        name: 'App Admin',
        password: 'Password123!',
      });
      createdUserIds.push(appAdminUser.id);

      const appAdminSession = {
        user: { id: appAdminUser.id, role: Role.APPLICATION_ADMIN },
      } as unknown as Session;
      const noAssignmentApps = await listApplicationsForUser(appAdminSession);
      expect(noAssignmentApps.some((app) => app.id === application.id)).toBe(false);

      await assignApplicationAdmin({
        applicationId: application.id,
        userId: appAdminUser.id,
        assignedByUserId: creatorUserId,
      });

      const assignedApps = await listApplicationsForUser(appAdminSession);
      expect(assignedApps).toHaveLength(1);
      expect(assignedApps[0]?.id).toBe(application.id);
    });
  });

  describe('getApplicationById', () => {
    it('returns the application with its environments and adminAssignments included', async () => {
      const application = await createTestApplication();

      const found = await getApplicationById(application.id);

      expect(found).not.toBeNull();
      expect(found?.environments).toHaveLength(1);
      expect(found?.adminAssignments).toEqual([]);
    });

    it('returns null for a nonexistent id', async () => {
      const found = await getApplicationById('nonexistent-application-id');
      expect(found).toBeNull();
    });
  });

  describe('assignApplicationAdmin / removeApplicationAdmin', () => {
    it('succeeds for a real APPLICATION_ADMIN-role user', async () => {
      const suffix = uniqueSuffix();
      const application = await createTestApplication();

      const appAdminUser = await createApplicationAdminUser({
        email: `apps-assignable-${suffix}@example.com`,
        name: 'Assignable Admin',
        password: 'Password123!',
      });
      createdUserIds.push(appAdminUser.id);

      const assignment = await assignApplicationAdmin({
        applicationId: application.id,
        userId: appAdminUser.id,
        assignedByUserId: creatorUserId,
      });

      expect(assignment.userId).toBe(appAdminUser.id);
      expect(assignment.applicationId).toBe(application.id);
    });

    it('throws InvalidAssignmentTargetError for a nonexistent user id', async () => {
      const application = await createTestApplication();

      await expect(
        assignApplicationAdmin({
          applicationId: application.id,
          userId: 'nonexistent-user-id',
          assignedByUserId: creatorUserId,
        }),
      ).rejects.toThrow(InvalidAssignmentTargetError);
    });

    it('throws InvalidAssignmentTargetError for a user whose role is ADMIN, not APPLICATION_ADMIN', async () => {
      const suffix = uniqueSuffix();
      const application = await createTestApplication();

      const adminRoleUser = await prisma.user.create({
        data: {
          email: `apps-wrong-role-${suffix}@example.com`,
          name: 'Wrong Role',
          passwordHash: 'unused-in-tests',
          role: Role.ADMIN,
          isActive: true,
        },
      });
      createdUserIds.push(adminRoleUser.id);

      await expect(
        assignApplicationAdmin({
          applicationId: application.id,
          userId: adminRoleUser.id,
          assignedByUserId: creatorUserId,
        }),
      ).rejects.toThrow(InvalidAssignmentTargetError);
    });

    it('throws ApplicationAdminAlreadyAssignedError on a second assignment of the same pair', async () => {
      const suffix = uniqueSuffix();
      const application = await createTestApplication();

      const appAdminUser = await createApplicationAdminUser({
        email: `apps-double-assign-${suffix}@example.com`,
        name: 'Double Assign',
        password: 'Password123!',
      });
      createdUserIds.push(appAdminUser.id);

      await assignApplicationAdmin({
        applicationId: application.id,
        userId: appAdminUser.id,
        assignedByUserId: creatorUserId,
      });

      await expect(
        assignApplicationAdmin({
          applicationId: application.id,
          userId: appAdminUser.id,
          assignedByUserId: creatorUserId,
        }),
      ).rejects.toThrow(ApplicationAdminAlreadyAssignedError);
    });

    it('removeApplicationAdmin succeeds and the assignment is gone; a second removal throws AssignmentNotFoundError', async () => {
      const suffix = uniqueSuffix();
      const application = await createTestApplication();

      const appAdminUser = await createApplicationAdminUser({
        email: `apps-removable-${suffix}@example.com`,
        name: 'Removable Admin',
        password: 'Password123!',
      });
      createdUserIds.push(appAdminUser.id);

      await assignApplicationAdmin({
        applicationId: application.id,
        userId: appAdminUser.id,
        assignedByUserId: creatorUserId,
      });

      await removeApplicationAdmin({ applicationId: application.id, userId: appAdminUser.id });

      const remaining = await prisma.applicationAdminAssignment.findUnique({
        where: {
          userId_applicationId: { userId: appAdminUser.id, applicationId: application.id },
        },
      });
      expect(remaining).toBeNull();

      await expect(
        removeApplicationAdmin({ applicationId: application.id, userId: appAdminUser.id }),
      ).rejects.toThrow(AssignmentNotFoundError);
    });

    it('throws AssignmentNotFoundError for a pair that was never assigned', async () => {
      const suffix = uniqueSuffix();
      const application = await createTestApplication();

      const neverAssignedUser = await createApplicationAdminUser({
        email: `apps-never-assigned-${suffix}@example.com`,
        name: 'Never Assigned',
        password: 'Password123!',
      });
      createdUserIds.push(neverAssignedUser.id);

      await expect(
        removeApplicationAdmin({ applicationId: application.id, userId: neverAssignedUser.id }),
      ).rejects.toThrow(AssignmentNotFoundError);
    });
  });
});
