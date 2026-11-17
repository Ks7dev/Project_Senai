import "server-only"
import { redirect } from "next/navigation"
import type { Permission } from "@/features/shared/lib/auth/permissions"
import {
  requireBackOfficeUser,
  requirePermission,
} from "@/features/shared/lib/db/permissions"
import { AppError } from "@/features/shared/lib/errors/action-result"

/** Page where the user turns 2FA on (#177, RF40). */
export const TWO_FACTOR_SETUP_PATH = "/conta/seguranca"

/**
 * Turns guard errors into redirects: visitors go to the login, users
 * who still need 2FA go to its activation page (#177) and users without
 * the permission go to the "no access" page.
 *
 * @param error - Error thrown by the permission check.
 * @param from - Current path, to come back after login.
 * @returns Never; redirects or rethrows.
 */
function redirectOnGuardError(error: unknown, from: string): never {
  if (error instanceof AppError) {
    if (error.code === "unauthenticated") {
      redirect(`/entrar?redirect=${encodeURIComponent(from)}`)
    }
    if (
      error.code === "two_factor_setup" ||
      error.code === "two_factor_verify"
    ) {
      redirect(TWO_FACTOR_SETUP_PATH)
    }
    if (error.code === "forbidden") redirect("/admin/sem-acesso")
  }
  throw error
}

/**
 * Guard for back office screens without a specific permission (home and
 * menu): login and mandatory 2FA (#177).
 *
 * @param from - Current path, to come back after login.
 * @returns The user and their permissions.
 */
export async function requireBackOfficePage(from: string) {
  try {
    return await requireBackOfficeUser()
  } catch (error) {
    redirectOnGuardError(error, from)
  }
}

/**
 * Permission check for back office pages: sends visitors to the login,
 * users who still need 2FA to its activation (#177) and users without
 * the permission to the "no access" page. Every
 * admin page calls it, because layouts do not protect their pages.
 *
 * @param required - Permission needed to open the page.
 * @param from - Current path, to come back after login.
 * @returns The user and their permissions.
 */
export async function requirePagePermission(
  required: Permission,
  from: string
) {
  try {
    return await requirePermission(required)
  } catch (error) {
    redirectOnGuardError(error, from)
  }
}
