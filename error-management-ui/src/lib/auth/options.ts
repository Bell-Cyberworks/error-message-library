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
  // Auth.js does not support database-backed sessions with the Credentials provider — the
  // adapter's session table is only populated by its own sign-in flow (used by OAuth-style
  // providers), and Auth.js refuses to boot otherwise ("UnsupportedStrategy: Signing in with
  // credentials only supported if JWT strategy is enabled", https://errors.authjs.dev#unsupportedstrategy).
  // This is a correction to docs/management-ui-architecture.md, which called for database
  // sessions specifically so an Admin could deactivate a user instantly — that guarantee is
  // preserved below via the `session` callback's `isActive` re-check on every request instead
  // (it just can't be done by deleting a Session row, since none is created for Credentials
  // logins). The PrismaAdapter is still wired up so a future OAuth/SSO provider is additive.
  session: { strategy: 'jwt' },
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
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role: Role }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
      }

      // Re-check isActive on every request (not just at sign-in) so an Admin deactivating a
      // user takes effect on that user's very next request, without them needing to sign out —
      // the DB-revocation guarantee the architecture doc called for, adapted for JWT sessions.
      const dbUser = await prisma.user.findUnique({
        where: { id: token.id as string },
        select: { isActive: true },
      });

      if (!dbUser?.isActive) {
        // Auth.js has no built-in "reject this session" signal from the session callback;
        // returning an empty user object is the documented way to make `auth()` treat the
        // caller as unauthenticated (rbac.ts's guards all check `session?.user`).
        return { ...session, user: undefined as never };
      }

      return session;
    },
  },
});
