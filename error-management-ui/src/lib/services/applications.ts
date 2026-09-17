import type { Session } from 'next-auth';
import { Prisma } from '@prisma/client';
import type { Application, ApplicationAdminAssignment } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { UnauthorizedError } from '@/lib/auth/rbac';

// Epic 2 (US-2.1 through US-2.4) business logic. Kept out of Server Actions per
// management-ui-architecture.md's "Admin mutations" row — this layer is what both Server
// Actions (src/actions/applications.ts) and, in principle, future route handlers call.

/** Thrown by createApplication() when an Application name already exists (case-insensitive). */
export class DuplicateApplicationError extends Error {
  constructor(name: string) {
    super(`An Application named "${name}" already exists.`);
    this.name = 'DuplicateApplicationError';
  }
}

/** Thrown by assignApplicationAdmin() when the (userId, applicationId) pair is already assigned. */
export class ApplicationAdminAlreadyAssignedError extends Error {
  constructor() {
    super('This user is already assigned as an Application Admin for this Application.');
    this.name = 'ApplicationAdminAlreadyAssignedError';
  }
}

/**
 * Thrown by assignApplicationAdmin() when the target user doesn't exist or doesn't hold the
 * APPLICATION_ADMIN role — per US-2.3, an Admin can only assign existing
 * APPLICATION_ADMIN-role users, not arbitrary users.
 */
export class InvalidAssignmentTargetError extends Error {
  constructor() {
    super('The selected user is not an Application Admin and cannot be assigned.');
    this.name = 'InvalidAssignmentTargetError';
  }
}

/** Thrown by removeApplicationAdmin() when there is no matching assignment to remove. */
export class AssignmentNotFoundError extends Error {
  constructor() {
    super('That Application Admin assignment does not exist.');
    this.name = 'AssignmentNotFoundError';
  }
}

// Shared include shape so list/detail queries agree on what "an Application's admins" means
// (assignment row + the assigned user's public fields).
const APPLICATION_WITH_ADMINS_INCLUDE = {
  adminAssignments: {
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  },
} as const;

export type ApplicationWithAdmins = Prisma.ApplicationGetPayload<{
  include: typeof APPLICATION_WITH_ADMINS_INCLUDE;
}>;

// Matches the include shape getApplicationById() actually queries with (see below) — kept as
// its own const so the type and the query can't drift apart.
const APPLICATION_WITH_ADMINS_AND_ENVIRONMENTS_INCLUDE = {
  environments: {
    orderBy: [{ isProduction: 'desc' as const }, { name: 'asc' as const }],
  },
  ...APPLICATION_WITH_ADMINS_INCLUDE,
} satisfies Prisma.ApplicationInclude;

export type ApplicationWithAdminsAndEnvironments = Prisma.ApplicationGetPayload<{
  include: typeof APPLICATION_WITH_ADMINS_AND_ENVIRONMENTS_INCLUDE;
}>;

/**
 * US-2.1 — Registers a new Application and its initial Prod Environment in a single
 * transaction (per management-ui-backlog.md: "Registering an Application creates its
 * initial Prod environment automatically").
 */
export async function createApplication({
  name,
  createdByUserId,
}: {
  name: string;
  createdByUserId: string;
}): Promise<Application> {
  const existing = await prisma.application.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });

  if (existing) {
    throw new DuplicateApplicationError(name);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const application = await tx.application.create({
        data: { name, createdByUserId },
      });

      await tx.environment.create({
        data: {
          applicationId: application.id,
          name: 'Prod',
          isProduction: true,
        },
      });

      return application;
    });
  } catch (error) {
    // Defense-in-depth against a race between the pre-check above and the insert (the
    // unique index on Application.name is case-sensitive at the DB level, but this also
    // covers the exact-duplicate case if the pre-check above is ever bypassed).
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DuplicateApplicationError(name);
    }
    throw error;
  }
}

/**
 * US-2.4 — Returns every Application (with its assigned admins) for ADMIN sessions, or only
 * the Applications the user has an ApplicationAdminAssignment row for otherwise. This is the
 * enforcement point, not a UI-level filter — callers must not pre-filter and pass a subset in.
 */
export async function listApplicationsForUser(
  session: Session | null,
): Promise<ApplicationWithAdmins[]> {
  if (!session?.user) {
    throw new UnauthorizedError();
  }

  if (session.user.role === 'ADMIN') {
    return prisma.application.findMany({
      include: APPLICATION_WITH_ADMINS_INCLUDE,
      orderBy: { name: 'asc' },
    });
  }

  return prisma.application.findMany({
    where: { adminAssignments: { some: { userId: session.user.id } } },
    include: APPLICATION_WITH_ADMINS_INCLUDE,
    orderBy: { name: 'asc' },
  });
}

/**
 * For the Application detail/admins pages. Callers are responsible for calling
 * requireApplicationAccess()/requireRole() before using the result — this function itself
 * does not enforce access, since "does this application exist" and "may this session see it"
 * are separate concerns (see src/app/(admin)/applications/[applicationId]/page.tsx).
 */
export async function getApplicationById(
  applicationId: string,
): Promise<ApplicationWithAdminsAndEnvironments | null> {
  return prisma.application.findUnique({
    where: { id: applicationId },
    include: APPLICATION_WITH_ADMINS_AND_ENVIRONMENTS_INCLUDE,
  });
}

/**
 * US-2.3 — Assigns an existing APPLICATION_ADMIN-role user to an Application.
 */
export async function assignApplicationAdmin({
  applicationId,
  userId,
  assignedByUserId,
}: {
  applicationId: string;
  userId: string;
  assignedByUserId: string;
}): Promise<ApplicationAdminAssignment> {
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || user.role !== 'APPLICATION_ADMIN') {
    throw new InvalidAssignmentTargetError();
  }

  const existing = await prisma.applicationAdminAssignment.findUnique({
    where: { userId_applicationId: { userId, applicationId } },
  });

  if (existing) {
    throw new ApplicationAdminAlreadyAssignedError();
  }

  try {
    return await prisma.applicationAdminAssignment.create({
      data: { applicationId, userId, assignedByUserId },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ApplicationAdminAlreadyAssignedError();
    }
    throw error;
  }
}

/**
 * US-2.3 — Removes an Application Admin assignment ("Removing the assignment revokes access
 * to that Application immediately" — enforced naturally since requireApplicationAccess()
 * re-checks the assignment table on every subsequent request, no caching involved).
 */
export async function removeApplicationAdmin({
  applicationId,
  userId,
}: {
  applicationId: string;
  userId: string;
}): Promise<void> {
  try {
    await prisma.applicationAdminAssignment.delete({
      where: { userId_applicationId: { userId, applicationId } },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
      throw new AssignmentNotFoundError();
    }
    throw error;
  }
}
