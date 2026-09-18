import { Prisma } from '@prisma/client';
import type { Environment } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

// Epic 5 (US-5.1, extended to include creation — see this repo's task report for why: Epic 3
// requires an existing NonProd Environment to author into, but nothing in Epics 1-2 ever
// creates one) business logic. Follows src/lib/services/applications.ts's pattern:
// case-insensitive-uniqueness pre-check + P2002 race defense.

/** Thrown by createEnvironment() when an Environment name already exists (case-insensitive)
 *  within the same Application — matches the DB's @@unique([applicationId, name]). */
export class DuplicateEnvironmentNameError extends Error {
  constructor(name: string) {
    super(`An Environment named "${name}" already exists for this Application.`);
    this.name = 'DuplicateEnvironmentNameError';
  }
}

/**
 * Creates a NonProd Environment for an Application. isProduction is always false — the only
 * isProduction: true Environment is the one auto-created at Application registration
 * (src/lib/services/applications.ts's createApplication()); nothing here can ever create a
 * second production Environment.
 */
export async function createEnvironment({
  applicationId,
  name,
}: {
  applicationId: string;
  name: string;
}): Promise<Environment> {
  const existing = await prisma.environment.findFirst({
    where: { applicationId, name: { equals: name, mode: 'insensitive' } },
  });

  if (existing) {
    throw new DuplicateEnvironmentNameError(name);
  }

  try {
    return await prisma.environment.create({
      data: { applicationId, name, isProduction: false },
    });
  } catch (error) {
    // Defense-in-depth against a race between the pre-check above and the insert, same as
    // createApplication()'s P2002 handling.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DuplicateEnvironmentNameError(name);
    }
    throw error;
  }
}

/**
 * All Environments for an Application, production-first then name — matches
 * getApplicationById()'s environments include ordering in src/lib/services/applications.ts.
 */
export async function listEnvironmentsForApplication(
  applicationId: string,
): Promise<Environment[]> {
  return prisma.environment.findMany({
    where: { applicationId },
    orderBy: [{ isProduction: 'desc' }, { name: 'asc' }],
  });
}

/** For US-3.1's "create a code" form — that Application's NonProd Environments only, since a
 *  code can never be created directly in Prod. */
export async function listNonProductionEnvironmentsForApplication(
  applicationId: string,
): Promise<Environment[]> {
  return prisma.environment.findMany({
    where: { applicationId, isProduction: false },
    orderBy: { name: 'asc' },
  });
}

/** Exact-match lookup by (applicationId, name) — matches the DB's @@unique([applicationId,
 *  name]). Scoped to applicationId so an Environment name belonging to a different Application
 *  can never match. Used by the public lookup API (src/app/api/v1/lookup/route.ts). */
export async function getEnvironmentByName({
  applicationId,
  name,
}: {
  applicationId: string;
  name: string;
}): Promise<Environment | null> {
  return prisma.environment.findUnique({
    where: { applicationId_name: { applicationId, name } },
  });
}
