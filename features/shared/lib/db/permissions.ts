import "server-only"
import {
  hasPermission,
  permissionKey,
  type Permission,
} from "@/features/shared/lib/auth/permissions"
import {
  getCurrentUser,
  type SessionUser,
} from "@/features/shared/lib/auth/session"
import { prisma } from "@/features/shared/lib/db/prisma"
import { AppError } from "@/features/shared/lib/errors/action-result"
import { logger } from "@/features/shared/lib/logger/logger"

/** Message shown when the user is not logged in. */
export const UNAUTHENTICATED_MESSAGE = "Entre na sua conta para continuar."

/** Message shown when the user lacks the permission. */
export const FORBIDDEN_MESSAGE = "Você não tem permissão para esta ação."

/**
 * Loads every internal permission granted to a user through their
 * roles (RF55).
 *
 * @param userId - User id, taken from the session.
 * @returns The set of permission keys.
 */
export async function loadUserPermissions(
  userId: string
): Promise<Set<string>> {
  const rows = await prisma.rolePermission.findMany({
    where: { role: { userRoles: { some: { userId } } } },
    select: { permission: { select: { resource: true, action: true } } },
  })
  return new Set(
    rows.map(({ permission }) =>
      permissionKey(permission.resource, permission.action)
    )
  )
}

/**
 * Server-side permission check used by every back office action and
 * page. The user comes from the session, never from the request.
 *
 * @param required - Permission needed for the operation.
 * @returns The user and their permissions.
 * @throws AppError when not logged in ("unauthenticated") or not
 * allowed ("forbidden"); actions turn it into `{ success: false }`.
 */
export async function requirePermission(
  required: Permission
): Promise<{ user: SessionUser; permissions: Set<string> }> {
  const user = await getCurrentUser()
  if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")

  const permissions = await loadUserPermissions(user.id)
  if (!hasPermission(permissions, required)) {
    logger.warn("permission denied", { userId: user.id, required })
    throw new AppError(FORBIDDEN_MESSAGE, "forbidden")
  }
  return { user, permissions }
}
