"use server"

import {
  addItemsToCart,
  getOrCreateActiveCartId,
  loadCartView,
  mergeGuestCartAfterLogin,
  purchasableSkuWhere,
  readGuestToken,
  resolveCartOwner,
} from "@/features/shared/lib/cart/cart-store"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import { enforceActionRateLimit } from "@/features/shared/lib/rate-limit/action-limit"
import {
  addToCartSchema,
  type AddToCartInput,
} from "@/features/shared/schema/cart-schema"

/**
 * Adds a product variation to the active cart (RF07). Visitors get a
 * cart identified by an httpOnly cookie; logged-in users get the cart
 * persisted in their account. Rate limited per IP because visitors can
 * call it without logging in.
 *
 * @param input - SKU code and quantity.
 * @returns `{ success: true, count }` (units in the cart) or
 * `{ success: false, error }`.
 */
export async function addToCart(
  input: AddToCartInput
): Promise<ActionResult<{ count: number }>> {
  try {
    const parsed = addToCartSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Produto inválido.",
        "invalid"
      )
    }
    await enforceActionRateLimit("cart", { limit: 60, windowMs: 60_000 })
    const owner = await resolveCartOwner({ create: true })
    if (!owner) throw new AppError("Carrinho indisponível.", "no_owner")
    // A visitor cart left in the cookie joins the account cart first
    if ("userId" in owner && (await readGuestToken())) {
      await mergeGuestCartAfterLogin(owner.userId)
    }

    const sku = await prisma.sku.findFirst({
      where: { code: parsed.data.skuCode, ...purchasableSkuWhere() },
      select: { id: true },
    })
    if (!sku) {
      throw new AppError("Produto indisponível no momento.", "not_found")
    }

    const cartId = await prisma.$transaction(async (tx) => {
      const id = await getOrCreateActiveCartId(owner, tx)
      await addItemsToCart(tx, id, [
        { skuId: sku.id, quantity: parsed.data.quantity },
      ])
      return id
    })
    const cart = await loadCartView(cartId)
    return { success: true, count: cart.count }
  } catch (error) {
    return toActionError(error, { action: "addToCart" })
  }
}
