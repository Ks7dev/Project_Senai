"use server"

import { Prisma } from "@/generated/prisma/client"
import { getCurrentUser } from "@/features/shared/lib/auth/session"
import {
  activeCartWhere,
  addItemsToCart,
  findActiveCartId,
  loadCartExtrasRules,
  loadCartView,
  resolveCartOwner,
} from "@/features/shared/lib/cart/cart-store"
import { isServiceEligible } from "@/features/shared/lib/cart/cart-extras"
import type { CartView } from "@/features/shared/lib/cart/cart-types"
import { UNAUTHENTICATED_MESSAGE } from "@/features/shared/lib/db/permissions"
import { prisma } from "@/features/shared/lib/db/prisma"
import {
  AppError,
  toActionError,
  type ActionResult,
} from "@/features/shared/lib/errors/action-result"
import {
  removeCartItemSchema,
  saveProjectListSchema,
  setCartItemExtrasSchema,
  updateCartItemSchema,
  type RemoveCartItemInput,
  type SaveProjectListInput,
  type SetCartItemExtrasInput,
  type UpdateCartItemInput,
} from "@/features/cart/cart-page/schema/cart-page-schema"

/** Most project lists a customer can keep at once. */
const MAX_PROJECT_LISTS = 50

const ITEM_NOT_FOUND = "Item não encontrado no seu carrinho."

/**
 * Finds a line of the active cart of whoever is browsing. The owner
 * comes from the session or the visitor cookie, never from the request,
 * so nobody changes someone else's cart.
 *
 * @param itemId - Cart item id.
 * @returns The item and its cart id.
 * @throws AppError when the line is not in the caller's cart.
 */
async function findOwnedItem(itemId: string) {
  const owner = await resolveCartOwner({ create: false })
  if (!owner) throw new AppError(ITEM_NOT_FOUND, "not_found")
  const item = await prisma.cartItem.findFirst({
    where: { id: itemId, cart: activeCartWhere(owner) },
    select: { id: true, cartId: true },
  })
  if (!item) throw new AppError(ITEM_NOT_FOUND, "not_found")
  return item
}

/**
 * Changes the quantity of a cart line (RF07).
 *
 * @param input - Item id and the new quantity.
 * @returns `{ success: true, cart }` or `{ success: false, error }`.
 */
export async function updateCartItem(
  input: UpdateCartItemInput
): Promise<ActionResult<{ cart: CartView }>> {
  try {
    const parsed = updateCartItemSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Quantidade inválida.",
        "invalid"
      )
    }
    const item = await findOwnedItem(parsed.data.itemId)
    await prisma.cartItem.update({
      where: { id: item.id },
      data: { quantity: parsed.data.quantity },
    })
    return { success: true, cart: await loadCartView(item.cartId) }
  } catch (error) {
    return toActionError(error, { action: "updateCartItem" })
  }
}

/**
 * Removes a line from the cart (RF07).
 *
 * @param input - Item id.
 * @returns `{ success: true, cart }` or `{ success: false, error }`.
 */
export async function removeCartItem(
  input: RemoveCartItemInput
): Promise<ActionResult<{ cart: CartView }>> {
  try {
    const parsed = removeCartItemSchema.safeParse(input)
    if (!parsed.success) throw new AppError(ITEM_NOT_FOUND, "invalid")
    const item = await findOwnedItem(parsed.data.itemId)
    await prisma.cartItem.delete({ where: { id: item.id } })
    return { success: true, cart: await loadCartView(item.cartId) }
  } catch (error) {
    return toActionError(error, { action: "removeCartItem" })
  }
}

/**
 * Sets the laser engraving and the additional services of a cart line
 * (RF51, RF52). Only products that accept engraving can be engraved,
 * the text respects the configured length and only eligible services
 * offered in the settings table are accepted. Prices and extra days
 * come from the settings, never from the request.
 *
 * @param input - Item id, engraving (or null) and service keys.
 * @returns `{ success: true, cart }` or `{ success: false, error }`.
 */
export async function setCartItemExtras(
  input: SetCartItemExtrasInput
): Promise<ActionResult<{ cart: CartView }>> {
  try {
    const parsed = setCartItemExtrasSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Revise a personalização.",
        "invalid"
      )
    }
    const { personalization, services } = parsed.data
    const owned = await findOwnedItem(parsed.data.itemId)
    const [item, rules] = await Promise.all([
      prisma.cartItem.findUniqueOrThrow({
        where: { id: owned.id },
        select: {
          sku: {
            select: {
              product: {
                select: { personalizable: true, requiresInstallation: true },
              },
            },
          },
        },
      }),
      loadCartExtrasRules(),
    ])
    const product = item.sku.product

    if (personalization) {
      if (!product.personalizable) {
        throw new AppError(
          "Este produto não aceita gravação.",
          "not_personalizable"
        )
      }
      if (personalization.text.length > rules.engraving.maxLength) {
        throw new AppError(
          `Use até ${rules.engraving.maxLength} caracteres na gravação.`,
          "engraving_too_long"
        )
      }
    }
    const keys = [...new Set(services)]
    for (const key of keys) {
      const rule = rules.services.find((service) => service.key === key)
      if (!rule || !isServiceEligible(rule, product)) {
        throw new AppError(
          "Serviço indisponível para este produto.",
          "service_unavailable"
        )
      }
    }

    await prisma.cartItem.update({
      where: { id: owned.id },
      data: {
        personalization: personalization ?? Prisma.DbNull,
        services: keys.length > 0 ? keys : Prisma.DbNull,
      },
    })
    return { success: true, cart: await loadCartView(owned.cartId) }
  } catch (error) {
    return toActionError(error, { action: "setCartItemExtras" })
  }
}

/**
 * Saves the current cart as a named project list to resume later
 * (RF07). Only logged-in customers keep lists; the cart itself is left
 * as it is.
 *
 * @param input - List name.
 * @returns `{ success: true, listId }` or `{ success: false, error }`.
 */
export async function saveCartAsProjectList(
  input: SaveProjectListInput
): Promise<ActionResult<{ listId: string }>> {
  try {
    const parsed = saveProjectListSchema.safeParse(input)
    if (!parsed.success) {
      throw new AppError(
        parsed.error.issues[0]?.message ?? "Nome inválido.",
        "invalid"
      )
    }
    const user = await getCurrentUser()
    if (!user) throw new AppError(UNAUTHENTICATED_MESSAGE, "unauthenticated")

    const cartId = await findActiveCartId({ userId: user.id })
    const items = cartId
      ? await prisma.cartItem.findMany({
          where: { cartId },
          orderBy: { createdAt: "asc" },
        })
      : []
    if (items.length === 0) {
      throw new AppError("Seu carrinho está vazio.", "empty_cart")
    }

    const listId = await prisma.$transaction(async (tx) => {
      const lists = await tx.cart.count({
        where: { userId: user.id, kind: "PROJECT_LIST", deletedAt: null },
      })
      if (lists >= MAX_PROJECT_LISTS) {
        throw new AppError(
          `Você já tem ${MAX_PROJECT_LISTS} listas. Exclua uma antes de salvar outra.`,
          "too_many_lists"
        )
      }
      const list = await tx.cart.create({
        data: {
          kind: "PROJECT_LIST",
          name: parsed.data.name,
          userId: user.id,
        },
        select: { id: true },
      })
      await addItemsToCart(
        tx,
        list.id,
        items.map((item) => ({
          skuId: item.skuId,
          quantity: item.quantity,
          personalization: item.personalization as Prisma.InputJsonValue,
          services: item.services as Prisma.InputJsonValue,
        }))
      )
      return list.id
    })
    return { success: true, listId }
  } catch (error) {
    return toActionError(error, { action: "saveCartAsProjectList" })
  }
}
