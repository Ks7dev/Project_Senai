"use server"

import { z } from "zod"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"

/**
 * Ids of the products favorited by the logged-in user (RF45). Empty
 * for visitors, so the buttons render as "not favorited".
 *
 * @returns `{ success: true, productIds }` or `{ success: false, error }`.
 */
export async function listMyFavoriteIds(): Promise<
  ActionResult<{ productIds: string[] }>
> {
  try {
    const user = await getCurrentUser()
    if (!user) return { success: true, productIds: [] }
    const rows = await prisma.favorite.findMany({
      where: { userId: user.id },
      select: { productId: true },
    })
    return { success: true, productIds: rows.map((row) => row.productId) }
  } catch (error) {
    return toActionError(error, { action: "listMyFavoriteIds" })
  }
}

/**
 * Adds or removes a product from the logged-in user's favorites (RF45).
 * Stored in the database, so favorites persist between sessions and
 * devices.
 *
 * @param input - Product id and whether it should be a favorite.
 * @returns `{ success: true, favorite }` or `{ success: false, error }`.
 */
export async function setFavorite(input: {
  productId: string
  favorite: boolean
}): Promise<ActionResult<{ favorite: boolean }>> {
  try {
    const { productId, favorite } = z
      .object({ productId: z.uuid(), favorite: z.boolean() })
      .parse(input)
    const user = await getCurrentUser()
    if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")
    if (favorite) {
      const product = await prisma.product.findFirst({
        where: { id: productId, deletedAt: null },
        select: { id: true },
      })
      if (!product) throw new AppError("Produto não encontrado.", "not_found")
      await prisma.favorite.upsert({
        where: { userId_productId: { userId: user.id, productId } },
        create: { userId: user.id, productId },
        update: {},
      })
    } else {
      await prisma.favorite.deleteMany({
        where: { userId: user.id, productId },
      })
    }
    return { success: true, favorite }
  } catch (error) {
    return toActionError(error, { action: "setFavorite" })
  }
}
