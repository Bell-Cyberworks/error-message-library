import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Prisma 7 no longer reads DATABASE_URL from schema.prisma — the connection is handed to
// PrismaClient explicitly via a driver adapter. See prisma.config.ts for the equivalent
// wiring used by the Prisma CLI (migrate/generate).
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

// Next.js-safe singleton: hot-reloading in dev would otherwise create a new PrismaClient
// (and a new connection pool) on every file change.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
