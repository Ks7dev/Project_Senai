"use server"

import {
  internalUserRolesSchema,
  type InternalUserRolesInput,
} from "@/features/backoffice/internal-users/schema/internal-users-schema"
import { writeAudit } from "@/features/shared/lib/db/audit"
import { requirePermission } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"

/** An internal profile that can be given to a user. */
export type InternalRole = {
  /** Stable key, e.g. "sales". */
  key: string
  /** Name in Portuguese, e.g. "Comercial". */
  name: string
  /** Whether the profile can manage internal users. */
  managesUsers: boolean
}

/** A user with back office access. */
export type InternalUser = {
  id: string
  name: string
  email: string
  /** Keys of the profiles the user holds. */
  roles: string[]
  /** Whether this is the logged-in administrator. */
  isCurrentUser: boolean
}

/**
 * Lists the internal profiles and the users who hold them (RF55).
 *
 * @returns `{ success: true, roles, users }` or `{ success: false, error }`.
 */
export async function listInternalUsers(): Promise<
  ActionResult<{ roles: InternalRole[]; users: InternalUser[] }>
> {
  try {
    const { user } = await requirePermission("user:manage")
    const [roles, users] = await Promise.all([
      prisma.role.findMany({
        orderBy: { name: "asc" },
        select: {
          key: true,
          name: true,
          rolePermissions: {
            where: { permission: { resource: "user", action: "manage" } },
            select: { roleId: true },
          },
        },
      }),
      prisma.user.findMany({
        where: { userRoles: { some: {} } },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          email: true,
          userRoles: { select: { role: { select: { key: true } } } },
        },
      }),
    ])
    return {
      success: true,
      roles: roles.map((role) => ({
        key: role.key,
        name: role.name,
        managesUsers: role.rolePermissions.length > 0,
      })),
      users: users.map((row) => ({
        id: row.id,
        name: row.name,
        email: row.email,
        roles: row.userRoles.map((item) => item.role.key).sort(),
        isCurrentUser: row.id === user.id,
      })),
    }
  } catch (error) {
    return toActionError(error, { action: "listInternalUsers" })
  }
}

/**
 * Sets the internal profiles of a user (RF55): gives back office access
 * to an existing account, changes its profiles or, with an empty list,
 * removes the access. Administrators cannot remove their own access to
 * the user management, so the back office never ends up without one.
 * The change is audited in the same transaction (RNF12).
 *
 * @param input - E-mail of the account and the profile keys.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function setInternalUserRoles(
  input: InternalUserRolesInput
): Promise<ActionResult> {
  try {
    const parsed = internalUserRolesSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise os dados.",
        "invalid"
      )
    }
    const { email, roles: keys } = parsed.data
    const { user } = await requirePermission("user:manage")

    await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { email },
        select: {
          id: true,
          userRoles: { select: { role: { select: { key: true } } } },
        },
      })
      if (!target) {
        throw new AppError(
          "Não há conta com este e-mail. A pessoa precisa se cadastrar na loja antes de receber um perfil interno.",
          "not_found"
        )
      }
      const roles = await tx.role.findMany({
        where: { key: { in: keys } },
        select: {
          id: true,
          key: true,
          rolePermissions: {
            where: { permission: { resource: "user", action: "manage" } },
            select: { roleId: true },
          },
        },
      })
      if (roles.length !== keys.length) {
        throw new AppError("Perfil não encontrado.", "invalid_role")
      }
      if (
        target.id === user.id &&
        !roles.some((role) => role.rolePermissions.length > 0)
      ) {
        throw new AppError(
          "Você não pode remover o seu próprio acesso à gestão de usuários. Peça a outro administrador.",
          "self_lockout"
        )
      }

      const before = target.userRoles.map((item) => item.role.key).sort()
      await tx.userRole.deleteMany({ where: { userId: target.id } })
      if (roles.length > 0) {
        await tx.userRole.createMany({
          data: roles.map((role) => ({ userId: target.id, roleId: role.id })),
        })
      }
      await writeAudit(tx, {
        userId: user.id,
        action: "user.roles",
        entity: "user",
        entityId: target.id,
        before: { roles: before },
        after: { roles: roles.map((role) => role.key).sort() },
      })
    })
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "setInternalUserRoles" })
  }
}
