import "server-only"
import {
  hasPermission,
  permissionKey,
  twoFactorGate,
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

/** Message shown when the profile requires 2FA and it is still off. */
export const TWO_FACTOR_SETUP_MESSAGE =
  "O seu perfil exige a verificação em duas etapas. Ative-a em Dados e segurança para acessar o back office."

/** Message shown when 2FA is on but the session skipped the code. */
export const TWO_FACTOR_VERIFY_MESSAGE =
  "Saia e entre novamente com o código do aplicativo autenticador para acessar o back office."

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
  assertTwoFactor(user, permissions)
  return { user, permissions }
}

/**
 * Enforces mandatory 2FA (#177): a profile with access to orders,
 * payments or refunds (`TWO_FACTOR_REQUIRED_PERMISSIONS`) needs 2FA on
 * and verified in the current session. Applies to every back office
 * page and action, whatever permission they ask for.
 *
 * @param user - Logged-in user, from the session.
 * @param permissions - Permissions of the user.
 * @throws AppError "two_factor_setup" when 2FA is off, or
 * "two_factor_verify" when the session was opened without the code.
 */
export function assertTwoFactor(
  user: SessionUser,
  permissions: ReadonlySet<string>
): void {
  const gate = twoFactorGate(permissions, user)
  if (gate === "ok") return
  logger.warn("two-factor required", { userId: user.id, gate })
  if (gate === "setup") {
    throw new AppError(TWO_FACTOR_SETUP_MESSAGE, "two_factor_setup")
  }
  throw new AppError(TWO_FACTOR_VERIFY_MESSAGE, "two_factor_verify")
}

/**
 * Server-side check for back office screens that need no specific
 * permission (home and menu): logged in, with 2FA when the profile
 * requires it (#177).
 *
 * @returns The user and their permissions.
 * @throws AppError "unauthenticated", "two_factor_setup" or
 * "two_factor_verify".
 */
export async function requireBackOfficeUser(): Promise<{
  user: SessionUser
  permissions: Set<string>
}> {
  const user = await getCurrentUser()
  if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")
  const permissions = await loadUserPermissions(user.id)
  assertTwoFactor(user, permissions)
  return { user, permissions }
}
