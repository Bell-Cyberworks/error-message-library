import type { DefaultSession } from 'next-auth';
import type { Role } from '@prisma/client';

// Augments next-auth's Session/User types with the fields our callbacks add
// (src/lib/auth/options.ts) — role and id are used throughout src/lib/auth/rbac.ts.
declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: Role;
    } & DefaultSession['user'];
  }

  interface User {
    role: Role;
  }
}
