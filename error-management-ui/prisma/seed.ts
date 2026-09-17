/**
 * Bootstraps the very first Admin account into an otherwise-empty database.
 * There is no self-signup (per management-ui-architecture.md / management-ui-backlog.md
 * US-2.2) — every account after this one is created by an Admin via the Management UI.
 *
 * Reads ADMIN_EMAIL / ADMIN_PASSWORD from the environment (see .env.example) and upserts a
 * single User with role: 'ADMIN', hashing the password with @node-rs/argon2.
 *
 * Run with: npm run db:seed
 */
import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from '@node-rs/argon2';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email) {
    throw new Error(
      'ADMIN_EMAIL environment variable is required to seed the first Admin account. See .env.example.',
    );
  }

  if (!password) {
    throw new Error(
      'ADMIN_PASSWORD environment variable is required to seed the first Admin account. See .env.example.',
    );
  }

  const passwordHash = await hash(password);

  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
    },
    create: {
      email,
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
    },
  });

  console.log(`Seeded Admin user: ${admin.email} (${admin.id})`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
