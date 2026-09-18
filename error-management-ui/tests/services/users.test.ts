import { afterAll, describe, expect, it } from 'vitest';
import { verify } from '@node-rs/argon2';
import { Role } from '@prisma/client';
import {
  DuplicateUserEmailError,
  createApplicationAdminUser,
  listAllUsers,
  listApplicationAdminUsers,
} from '@/lib/services/users';
import { prisma, uniqueSuffix } from '../testDb';

// Formalizes the users.ts scenarios previously verified manually (US-2.2, plus the /users
// audit page's listing helpers).
describe('users service', () => {
  const createdUserIds: string[] = [];

  afterAll(async () => {
    if (createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
  });

  describe('createApplicationAdminUser', () => {
    it('creates a User with role APPLICATION_ADMIN, isActive true, and a real argon2 password hash that round-trips', async () => {
      const suffix = uniqueSuffix();
      const email = `user-${suffix}@example.com`;
      const password = 'CorrectHorseBattery1!';

      const user = await createApplicationAdminUser({ email, name: 'Test User', password });
      createdUserIds.push(user.id);

      expect(user.role).toBe('APPLICATION_ADMIN');
      expect(user.isActive).toBe(true);
      expect(user.email).toBe(email);

      const raw = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
      expect(raw.passwordHash).not.toBe(password);
      expect(raw.passwordHash.length).toBeGreaterThan(0);

      // Not just "looks hashed" — actually verify it round-trips with the same library
      // src/lib/auth/options.ts uses to check login credentials.
      const verified = await verify(raw.passwordHash, password);
      expect(verified).toBe(true);

      const rejectsWrongPassword = await verify(raw.passwordHash, `${password}-wrong`);
      expect(rejectsWrongPassword).toBe(false);
    });

    it('throws DuplicateUserEmailError for a case-insensitive duplicate email', async () => {
      const suffix = uniqueSuffix();
      const email = `dup-${suffix}@example.com`;

      const user = await createApplicationAdminUser({ email, name: 'First', password: 'Password123!' });
      createdUserIds.push(user.id);

      await expect(
        createApplicationAdminUser({
          email: email.toUpperCase(),
          name: 'Second',
          password: 'Password123!',
        }),
      ).rejects.toThrow(DuplicateUserEmailError);
    });

    it('never includes passwordHash on the returned object (PUBLIC_USER_SELECT projection)', async () => {
      const suffix = uniqueSuffix();
      const user = await createApplicationAdminUser({
        email: `noleak-${suffix}@example.com`,
        name: 'No Leak',
        password: 'Password123!',
      });
      createdUserIds.push(user.id);

      expect('passwordHash' in user).toBe(false);
      expect(Object.keys(user).sort()).toEqual(
        ['createdAt', 'email', 'id', 'isActive', 'name', 'role'].sort(),
      );
    });
  });

  describe('listApplicationAdminUsers / listAllUsers', () => {
    it('listApplicationAdminUsers only returns APPLICATION_ADMIN-role users; listAllUsers returns both roles', async () => {
      const suffix = uniqueSuffix();

      const appAdmin = await createApplicationAdminUser({
        email: `list-appadmin-${suffix}@example.com`,
        name: 'List App Admin',
        password: 'Password123!',
      });
      createdUserIds.push(appAdmin.id);

      const admin = await prisma.user.create({
        data: {
          email: `list-admin-${suffix}@example.com`,
          name: 'List Admin',
          passwordHash: 'unused-in-tests',
          role: Role.ADMIN,
          isActive: true,
        },
      });
      createdUserIds.push(admin.id);

      const appAdmins = await listApplicationAdminUsers();
      expect(appAdmins.some((user) => user.id === appAdmin.id)).toBe(true);
      expect(appAdmins.some((user) => user.id === admin.id)).toBe(false);

      const all = await listAllUsers();
      expect(all.some((user) => user.id === appAdmin.id)).toBe(true);
      expect(all.some((user) => user.id === admin.id)).toBe(true);
    });
  });
});
