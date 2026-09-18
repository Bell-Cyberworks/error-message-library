import { hash, verify } from '@node-rs/argon2';
import { Prisma } from '@prisma/client';
import type { ApplicationApiKey, SystemApiKey } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { generateApiKey, KEY_PREFIX_LENGTH } from '@/lib/apiKeys/generateApiKey';

// API key authentication for the public lookup endpoint (src/app/api/v1/lookup/route.ts).
// Follows src/lib/services/applications.ts's pattern: case-insensitive-uniqueness pre-check +
// P2002 race defense for creation, typed errors for the Server Actions layer
// (src/actions/apiKeys.ts) to catch. Hashing uses @node-rs/argon2's hash()/verify(), the same
// library prisma/seed.ts and src/lib/auth/options.ts already use for password hashing.

/** Thrown by createApplicationApiKey()/createSystemApiKey() when the key name already exists
 *  (case-insensitive) within its scope (per-Application for ApplicationApiKey, global for
 *  SystemApiKey) — matches the DB's @@unique constraint, same as
 *  applications.ts's DuplicateApplicationError. */
export class DuplicateApiKeyNameError extends Error {
  constructor(name: string) {
    super(`An API key named "${name}" already exists.`);
    this.name = 'DuplicateApiKeyNameError';
  }
}

/** Thrown by revokeApplicationApiKey()/revokeSystemApiKey() when the id doesn't exist, doesn't
 *  belong to the given Application (cross-tenant guard, same pattern as every other
 *  cross-tenant check in this codebase — see errorCodes.ts's InvalidEnvironmentError), or is
 *  already revoked. */
export class ApiKeyNotFoundError extends Error {
  constructor() {
    super('That API key does not exist or has already been revoked.');
    this.name = 'ApiKeyNotFoundError';
  }
}

// Never select keyHash — these are the only shapes service functions in this file hand back
// to callers (Server Actions/pages), same convention as users.ts's PUBLIC_USER_SELECT never
// returning passwordHash.
const APPLICATION_API_KEY_SAFE_SELECT = {
  id: true,
  applicationId: true,
  name: true,
  keyPrefix: true,
  createdByUserId: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
} as const;

export type SafeApplicationApiKey = Pick<
  ApplicationApiKey,
  'id' | 'applicationId' | 'name' | 'keyPrefix' | 'createdByUserId' | 'createdAt' | 'lastUsedAt' | 'revokedAt'
>;

const SYSTEM_API_KEY_SAFE_SELECT = {
  id: true,
  name: true,
  keyPrefix: true,
  createdByUserId: true,
  createdAt: true,
  lastUsedAt: true,
  revokedAt: true,
} as const;

export type SafeSystemApiKey = Pick<
  SystemApiKey,
  'id' | 'name' | 'keyPrefix' | 'createdByUserId' | 'createdAt' | 'lastUsedAt' | 'revokedAt'
>;

/**
 * Creates a new API key scoped to one Application — the only place in the whole codebase the
 * raw key is ever returned to a caller. The raw key is not, and must never be, recoverable
 * after this call returns; only its argon2 hash is persisted.
 */
export async function createApplicationApiKey({
  applicationId,
  name,
  createdByUserId,
}: {
  applicationId: string;
  name: string;
  createdByUserId: string;
}): Promise<{ record: SafeApplicationApiKey; rawKey: string }> {
  const existing = await prisma.applicationApiKey.findFirst({
    where: { applicationId, name: { equals: name, mode: 'insensitive' } },
  });

  if (existing) {
    throw new DuplicateApiKeyNameError(name);
  }

  const { rawKey, keyPrefix } = generateApiKey('application');
  const keyHash = await hash(rawKey);

  try {
    const record = await prisma.applicationApiKey.create({
      data: { applicationId, name, keyPrefix, keyHash, createdByUserId },
      select: APPLICATION_API_KEY_SAFE_SELECT,
    });

    return { record, rawKey };
  } catch (error) {
    // Defense-in-depth against a race between the pre-check above and the insert, same as
    // createApplication()'s P2002 handling.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DuplicateApiKeyNameError(name);
    }
    throw error;
  }
}

/** For the per-Application API keys page — every key (active and revoked) for this
 *  Application, most recently created first. Never selects keyHash. */
export async function listApplicationApiKeys(applicationId: string): Promise<SafeApplicationApiKey[]> {
  return prisma.applicationApiKey.findMany({
    where: { applicationId },
    select: APPLICATION_API_KEY_SAFE_SELECT,
    orderBy: { createdAt: 'desc' },
  });
}

/** Soft-deletes (sets revokedAt) a per-Application key. Scoped to applicationId so a key
 *  belonging to a different Application can never be revoked via this call, same cross-tenant
 *  pattern as every other Application-scoped mutation in this codebase. */
export async function revokeApplicationApiKey({
  id,
  applicationId,
}: {
  id: string;
  applicationId: string;
}): Promise<void> {
  const existing = await prisma.applicationApiKey.findUnique({ where: { id } });

  if (!existing || existing.applicationId !== applicationId || existing.revokedAt) {
    throw new ApiKeyNotFoundError();
  }

  await prisma.applicationApiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
}

/**
 * Creates a new system-level API key — cross-Application read/lookup access, for trusted
 * internal callers (Error UI) that can't hold one Application's key ahead of time. Same
 * one-time-raw-key contract as createApplicationApiKey() above.
 */
export async function createSystemApiKey({
  name,
  createdByUserId,
}: {
  name: string;
  createdByUserId: string;
}): Promise<{ record: SafeSystemApiKey; rawKey: string }> {
  const existing = await prisma.systemApiKey.findFirst({
    where: { name: { equals: name, mode: 'insensitive' } },
  });

  if (existing) {
    throw new DuplicateApiKeyNameError(name);
  }

  const { rawKey, keyPrefix } = generateApiKey('system');
  const keyHash = await hash(rawKey);

  try {
    const record = await prisma.systemApiKey.create({
      data: { name, keyPrefix, keyHash, createdByUserId },
      select: SYSTEM_API_KEY_SAFE_SELECT,
    });

    return { record, rawKey };
  } catch (error) {
    // Defense-in-depth against a race between the pre-check above and the insert — the
    // schema's @@unique(name) already enforces this at the DB level, but the friendly
    // pre-check + P2002 catch matches every other create function's pattern in this codebase.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DuplicateApiKeyNameError(name);
    }
    throw error;
  }
}

/** For the system API keys page — every system key (active and revoked), most recently
 *  created first. Never selects keyHash. */
export async function listSystemApiKeys(): Promise<SafeSystemApiKey[]> {
  return prisma.systemApiKey.findMany({
    select: SYSTEM_API_KEY_SAFE_SELECT,
    orderBy: { createdAt: 'desc' },
  });
}

/** Soft-deletes (sets revokedAt) a system key. */
export async function revokeSystemApiKey(id: string): Promise<void> {
  const existing = await prisma.systemApiKey.findUnique({ where: { id } });

  if (!existing || existing.revokedAt) {
    throw new ApiKeyNotFoundError();
  }

  await prisma.systemApiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
}

/**
 * The actual authorization check for the public lookup API
 * (src/app/api/v1/lookup/route.ts). Given a raw key straight from the Authorization header
 * (already stripped of the "Bearer " prefix by the caller) and the target applicationId,
 * returns which scope authorized the request ('application' | 'system'), or null if the key
 * is missing, unrecognized, not found, revoked, or valid for a different Application.
 *
 * Deliberately returns null rather than throwing for "no valid key" — the caller turns that
 * into a generic 401 with no differentiation between "key doesn't parse", "key not found", and
 * "key valid but wrong Application", so a caller can't use response differences to probe which
 * Applications/keys exist. Don't add such differentiation here either.
 */
export async function verifyApiKeyForApplication({
  applicationId,
  rawKey,
}: {
  applicationId: string;
  rawKey: string;
}): Promise<'application' | 'system' | null> {
  const keyPrefix = rawKey.slice(0, KEY_PREFIX_LENGTH);

  if (rawKey.startsWith('eml_sys_')) {
    const candidates = await prisma.systemApiKey.findMany({
      where: { keyPrefix, revokedAt: null },
    });

    for (const candidate of candidates) {
      // Prefixes narrow the candidate set but are not guaranteed unique — verify the full raw
      // key against every non-revoked candidate's hash rather than assuming a single match.
      const isValid = await verify(candidate.keyHash, rawKey);
      if (isValid) {
        await prisma.systemApiKey.update({
          where: { id: candidate.id },
          data: { lastUsedAt: new Date() },
        });
        return 'system';
      }
    }

    return null;
  }

  if (rawKey.startsWith('eml_app_')) {
    // Scoped to the target Application up front — an app-scoped key for a *different*
    // Application must never match here, even if its prefix happens to collide (keyPrefix
    // alone can't guarantee against that; this where clause plus verify() below is what
    // actually confirms it).
    const candidates = await prisma.applicationApiKey.findMany({
      where: { applicationId, keyPrefix, revokedAt: null },
    });

    for (const candidate of candidates) {
      const isValid = await verify(candidate.keyHash, rawKey);
      if (isValid) {
        await prisma.applicationApiKey.update({
          where: { id: candidate.id },
          data: { lastUsedAt: new Date() },
        });
        return 'application';
      }
    }

    return null;
  }

  return null;
}
