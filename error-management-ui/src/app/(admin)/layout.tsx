import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { auth } from '@/lib/auth/options';

// Session guard + nav for the whole (admin) route group (/applications/*, /users/*).
// This is the only gate — no edge middleware, since database-backed sessions need a
// Postgres round-trip that the pg driver (and argon2's native binding, pulled in via
// src/lib/auth/options.ts) can't do on the Edge runtime. Server Actions and route
// handlers must still call requireRole()/requireApplicationAccess() themselves
// (see src/lib/auth/rbac.ts) — this layout guard only covers page navigation.
export default async function AdminLayout({ children }: Readonly<{ children: ReactNode }>) {
  const session = await auth();

  if (!session?.user) {
    redirect('/login');
  }

  const isAdmin = session.user.role === 'ADMIN';

  return (
    <div>
      <nav aria-label="Primary">
        <ul>
          <li>
            <Link href="/applications">Applications</Link>
          </li>
          {isAdmin ? (
            <li>
              <Link href="/users">Users</Link>
            </li>
          ) : null}
        </ul>
      </nav>
      <main>{children}</main>
    </div>
  );
}
