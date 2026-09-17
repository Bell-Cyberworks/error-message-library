import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import { verify } from '@node-rs/argon2';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

// Note: src/lib/auth/next-auth.d.ts augments next-auth's Session/User types with
// `role`/`id`. Ambient .d.ts files are picked up automatically via tsconfig's include glob
// and don't need to be imported here.

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  // Database-backed sessions (not JWT-only) so an Admin can revoke a session or deactivate
  // a user instantly — see docs/management-ui-architecture.md, "Auth & RBAC".
  session: { strategy: 'database' },
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = typeof credentials?.email === 'string' ? credentials.email : undefined;
        const password =
          typeof credentials?.password === 'string' ? credentials.password : undefined;

        if (!email || !password) {
          return null;
        }

        const user = await prisma.user.findUnique({ where: { email } });

        if (!user || !user.isActive) {
          return null;
        }

        const isValidPassword = await verify(user.passwordHash, password);

        if (!isValidPassword) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        session.user.role = (user as { role: Role }).role;
      }
      return session;
    },
  },
});
