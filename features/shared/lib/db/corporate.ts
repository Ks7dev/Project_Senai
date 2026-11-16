import "server-only"
import {
  hasCorporatePermission,
  parseRoles,
  type CorporatePermission,
  type CorporateRole,
} from "@/features/shared/lib/auth/corporate-roles"
import {
  getCurrentUser,
  type SessionUser,
} from "@/features/shared/lib/auth/session"
import {
  FORBIDDEN_MESSAGE,
  UNAUTHENTICATED_MESSAGE,
} from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import { AppError } from "@/features/shared/lib/errors/action-result"
import { logger } from "@/features/shared/lib/logger/logger"

/** The logged-in member of a corporate account. */
export type CorporateContext = {
  user: SessionUser
  organizationId: string
  roles: CorporateRole[]
}

/**
 * Loads the corporate account of the logged-in user, if any. The user
 * comes from the session, never from the request.
 *
 * @returns The context, or null for PF customers and visitors.
 */
export async function getCorporateContext(): Promise<CorporateContext | null> {
  const user = await getCurrentUser()
  if (!user) return null
  const member = await prisma.member.findFirst({
    where: { userId: user.id, organization: { deletedAt: null } },
    select: { organizationId: true, role: true },
    orderBy: { createdAt: "asc" },
  })
  if (!member) return null
  return {
    user,
    organizationId: member.organizationId,
    roles: parseRoles(member.role),
  }
}

/**
 * Server-side check for corporate actions (RF10): the user must belong
 * to a corporate account and hold a role with the permission.
 *
 * @param permission - Required corporate permission.
 * @returns The corporate context.
 * @throws AppError "unauthenticated", "not_corporate" or "forbidden".
 */
export async function requireCorporatePermission(
  permission: CorporatePermission
): Promise<CorporateContext> {
  const user = await getCurrentUser()
  if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")
  const context = await getCorporateContext()
  if (!context) {
    throw new AppError(
      "Esta área é exclusiva de contas corporativas.",
      "not_corporate"
    )
  }
  if (!hasCorporatePermission(context.roles, permission)) {
    logger.warn("corporate permission denied", {
      userId: context.user.id,
      permission,
    })
    throw new AppError(FORBIDDEN_MESSAGE, "forbidden")
  }
  return context
}
