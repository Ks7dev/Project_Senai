import "server-only"
import { redirect } from "next/navigation"
import type { Permission } from "@/features/shared/lib/auth/permissions"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { AppError } from "@/features/shared/lib/errors/action-result"

/**
 * Permission check for back office pages: sends visitors to the login
 * and users without the permission to the "no access" page. Every
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
    if (error instanceof AppError && error.code === "unauthenticated") {
      redirect(`/entrar?redirect=${encodeURIComponent(from)}`)
    }
    if (error instanceof AppError && error.code === "forbidden") {
      redirect("/admin/sem-acesso")
    }
    throw error
  }
}
