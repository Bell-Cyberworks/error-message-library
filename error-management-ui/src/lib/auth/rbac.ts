import type { Session } from 'next-auth';
import type { Role } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

/**
 * Thrown when there is no authenticated session at all.
 * Callers (Server Actions, route handlers) should map this to an HTTP 401.
 */
export class UnauthorizedError extends Error {
  readonly status = 401 as const;

  constructor(message = 'Authentication required.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Thrown when there is a session, but it doesn't have the required role/access.
 * Callers (Server Actions, route handlers) should map this to an HTTP 403.
 */
export class ForbiddenError extends Error {
  readonly status = 403 as const;

  constructor(message = 'You do not have permission to perform this action.') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Application registration, user management, and admin-assignment management are
 * Admin-only. Throws UnauthorizedError (no session) or ForbiddenError (wrong role) —
 * never returns a bare boolean, so callers can translate the failure into a 401/403.
 *
 * Usable from Server Actions, route handlers, and page loaders.
 */
export function requireRole(session: Session | null, role: Role): asserts session is Session {
  if (!session?.user) {
    throw new UnauthorizedError();
  }

  if (session.user.role !== role) {
    throw new ForbiddenError(`This action requires the ${role} role.`);
  }
}

/**
 * Error-code CRUD, environment management, and promotion actions all require this check:
 * true (does not throw) if the session's user is ADMIN, or has an
 * ApplicationAdminAssignment row for the given Application. Throws UnauthorizedError (no
 * session) or ForbiddenError (authenticated but not assigned to this Application).
 *
 * Usable from Server Actions, route handlers, and page loaders.
 */
export async function requireApplicationAccess(
  session: Session | null,
  applicationId: string,
): Promise<void> {
  if (!session?.user) {
    throw new UnauthorizedError();
  }

  if (session.user.role === 'ADMIN') {
    return;
  }

  const assignment = await prisma.applicationAdminAssignment.findUnique({
    where: {
      userId_applicationId: {
        userId: session.user.id,
        applicationId,
      },
    },
  });

  if (!assignment) {
    throw new ForbiddenError('You do not have access to this Application.');
  }
}
