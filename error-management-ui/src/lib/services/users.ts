import { hash } from '@node-rs/argon2';
import { Prisma, Role } from '@prisma/client';
import type { User } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

// US-2.2 — Admin-created Application Admin accounts, and the user lists Epic 2's other
// stories need (the assignment dropdown, the /users audit page).

/** Thrown by createApplicationAdminUser() when the email already exists (case-insensitive). */
export class DuplicateUserEmailError extends Error {
  constructor(email: string) {
    super(`A user with the email "${email}" already exists.`);
    this.name = 'DuplicateUserEmailError';
  }
}

// Never return passwordHash to callers (Server Actions/pages) — these are the only shapes
// service functions in this file hand back.
const PUBLIC_USER_SELECT = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
} as const;

export type PublicUser = Pick<
  User,
  'id' | 'email' | 'name' | 'role' | 'isActive' | 'createdAt'
>;

/**
 * US-2.2 — Creates a new User with the APPLICATION_ADMIN role. Password hashing matches
 * prisma/seed.ts (argon2id via @node-rs/argon2's hash()) so login (src/lib/auth/options.ts,
 * which verifies with the same library) works identically for seeded and Admin-created
 * accounts.
 */
export async function createApplicationAdminUser({
  email,
  name,
  password,
}: {
  email: string;
  name: string;
  password: string;
}): Promise<PublicUser> {
  const existing = await prisma.user.findFirst({
    where: { email: { equals: email, mode: 'insensitive' } },
  });

  if (existing) {
    throw new DuplicateUserEmailError(email);
  }

  const passwordHash = await hash(password);

  try {
    return await prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
        role: Role.APPLICATION_ADMIN,
        isActive: true,
      },
      select: PUBLIC_USER_SELECT,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new DuplicateUserEmailError(email);
    }
    throw error;
  }
}

/** For the US-2.3 assignment dropdown — every user eligible to be assigned to an Application. */
export async function listApplicationAdminUsers(): Promise<PublicUser[]> {
  return prisma.user.findMany({
    where: { role: Role.APPLICATION_ADMIN },
    select: PUBLIC_USER_SELECT,
    orderBy: { name: 'asc' },
  });
}

/** For the /users page (US-7.2 — Admins see and manage every user, not just Application Admins). */
export async function listAllUsers(): Promise<PublicUser[]> {
  return prisma.user.findMany({
    select: PUBLIC_USER_SELECT,
    orderBy: [{ role: 'asc' }, { name: 'asc' }],
  });
}
