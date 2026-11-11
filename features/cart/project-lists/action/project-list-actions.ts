"use server"

import type { Prisma } from "@/generated/prisma/client"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import {
  addItemsToCart,
  cartItemInclude,
  getOrCreateActiveCartId,
  loadCartExtrasRules,
  loadCartView,
  summarizeLines,
  toCartLine,
} from "@/features/shared/lib/cart/cart-store"
import type { ProjectListView } from "@/features/shared/lib/cart/cart-types"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import {
  projectListIdSchema,
  type ProjectListIdInput,
} from "@/features/cart/project-lists/schema/project-list-schema"

const LIST_NOT_FOUND = "Lista não encontrada."

/**
 * Logged-in user, from the session.
 *
 * @returns The user id.
 * @throws AppError when nobody is logged in.
 */
async function requireUserId(): Promise<string> {
  const user = await getCurrentUser()
  if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")
  return user.id
}

/**
 * Prisma filter of a list owned by the user and not deleted.
 *
 * @param userId - User id, from the session.
 * @param listId - List id.
 * @returns The where clause.
 */
function ownListWhere(userId: string, listId: string): Prisma.CartWhereInput {
  return { id: listId, userId, kind: "PROJECT_LIST", deletedAt: null }
}

/**
 * Saved project lists of the logged-in customer, newest first (RF07),
 * with current catalog prices.
 *
 * @returns `{ success: true, lists }` or `{ success: false, error }`.
 */
export async function listMyProjectLists(): Promise<
  ActionResult<{ lists: ProjectListView[] }>
> {
  try {
    const userId = await requireUserId()
    const rules = await loadCartExtrasRules()
    const rows = await prisma.cart.findMany({
      where: { userId, kind: "PROJECT_LIST", deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        items: { include: cartItemInclude, orderBy: { createdAt: "asc" } },
      },
    })
    return {
      success: true,
      lists: rows.map((row) => ({
        id: row.id,
        name: row.name ?? "Lista sem nome",
        updatedAt: row.updatedAt.toISOString(),
        ...summarizeLines(row.items.map((item) => toCartLine(item, rules))),
      })),
    }
  } catch (error) {
    return toActionError(error, { action: "listMyProjectLists" })
  }
}

/**
 * Resumes a saved project list: its items go into the active cart
 * (quantities are summed with what is already there) and the list is
 * kept for later use (RF07). Items that left the catalog are skipped.
 *
 * @param input - List id.
 * @returns `{ success: true, added, skipped, count }` or
 * `{ success: false, error }`.
 */
export async function resumeProjectList(
  input: ProjectListIdInput
): Promise<ActionResult<{ added: number; skipped: number; count: number }>> {
  try {
    const parsed = projectListIdSchema.safeParse(input)
    if (!parsed.success) throw new AppError(LIST_NOT_FOUND, "invalid")
    const userId = await requireUserId()

    const list = await prisma.cart.findFirst({
      where: ownListWhere(userId, parsed.data.listId),
      include: {
        items: { include: cartItemInclude, orderBy: { createdAt: "asc" } },
      },
    })
    if (!list) throw new AppError(LIST_NOT_FOUND, "not_found")
    const rules = await loadCartExtrasRules()
    const available = list.items.filter(
      (item) => toCartLine(item, rules).purchasable
    )
    if (available.length === 0) {
      throw new AppError(
        "Nenhum produto desta lista está disponível no momento.",
        "nothing_available"
      )
    }

    const cartId = await prisma.$transaction(async (tx) => {
      const id = await getOrCreateActiveCartId({ userId }, tx)
      await addItemsToCart(
        tx,
        id,
        available.map((item) => ({
          skuId: item.skuId,
          quantity: item.quantity,
          personalization: item.personalization as Prisma.InputJsonValue,
          services: item.services as Prisma.InputJsonValue,
        }))
      )
      return id
    })
    const cart = await loadCartView(cartId)
    return {
      success: true,
      added: available.length,
      skipped: list.items.length - available.length,
      count: cart.count,
    }
  } catch (error) {
    return toActionError(error, { action: "resumeProjectList" })
  }
}

/**
 * Deletes a saved project list (soft delete, kept for audit).
 *
 * @param input - List id.
 * @returns `{ success: true }` or `{ success: false, error }`.
 */
export async function deleteProjectList(
  input: ProjectListIdInput
): Promise<ActionResult> {
  try {
    const parsed = projectListIdSchema.safeParse(input)
    if (!parsed.success) throw new AppError(LIST_NOT_FOUND, "invalid")
    const userId = await requireUserId()
    const result = await prisma.cart.updateMany({
      where: ownListWhere(userId, parsed.data.listId),
      data: { deletedAt: new Date() },
    })
    if (result.count === 0) throw new AppError(LIST_NOT_FOUND, "not_found")
    return { success: true }
  } catch (error) {
    return toActionError(error, { action: "deleteProjectList" })
  }
}
